import type { APIRoute } from "astro";
import { createWorkersLogger } from "evlog/workers";
import { ensureEvlogError } from "../../lib/evlog";

export const prerender = false;

const WWW_RE = /^www\./;
const CONTENT_RE = /\bcontent\s*=\s*(["'])([^<>]*?)\1/i;
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractMeta(html: string, attr: string, value: string): string | null {
  const attrRe = new RegExp(
    `\\b${escapeRe(attr)}\\s*=\\s*(["'])${escapeRe(value)}\\1`,
    "i"
  );
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!attrRe.test(tag)) {
      continue;
    }
    const m = tag.match(CONTENT_RE);
    if (m?.[2]) {
      return decodeHtmlEntities(m[2]);
    }
  }

  return null;
}

function parseTarget(input: string, base?: URL): URL | null {
  let u: URL;
  try {
    u = base ? new URL(input, base) : new URL(input);
  } catch {
    return null;
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return null;
  }
  if (u.username || u.password) {
    return null;
  }

  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) {
    return null;
  }
  if (IPV4_RE.test(host)) {
    return null;
  }
  if (host.startsWith("[") || host.includes(":")) {
    return null;
  }

  return u;
}

function parseHttpUrl(input: string, base?: URL): URL | null {
  let u: URL;
  try {
    u = base ? new URL(input, base) : new URL(input);
  } catch {
    return null;
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return null;
  }

  return u;
}

const MAX_REDIRECT_HOPS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

async function fetchWithValidatedRedirects(initialUrl: URL): Promise<{
  response: Response;
  finalUrl: URL;
}> {
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    const response = await fetch(currentUrl, {
      headers: {
        "User-Agent": "Twitterbot/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });

    if (!REDIRECT_STATUSES.has(response.status)) {
      return { response, finalUrl: currentUrl };
    }

    if (hop === MAX_REDIRECT_HOPS) {
      throw new Error("Too many redirects");
    }

    const location = response.headers.get("Location");
    if (!location) {
      throw new Error("Redirect missing Location header");
    }

    const nextUrl = parseTarget(location, currentUrl);
    if (!nextUrl) {
      throw new Error("Redirect target failed validation");
    }

    currentUrl = nextUrl;
  }

  throw new Error("Too many redirects");
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

export const GET: APIRoute = async ({ url, request }) => {
  const log = createWorkersLogger(request);
  const target = url.searchParams.get("url");
  const targetUrl = target ? parseTarget(target) : null;

  if (!targetUrl) {
    log.set({ og: { url: target, valid: false } });
    log.emit({ status: 400 });
    return Response.json({ error: "Invalid url" }, { status: 400 });
  }

  log.set({ og: { domain: targetUrl.hostname.replace(WWW_RE, "") } });

  try {
    const { response: res, finalUrl } =
      await fetchWithValidatedRedirects(targetUrl);

    if (!res.ok) {
      log.set({ og: { fetchStatus: res.status, success: false } });
      log.emit({ status: 502 });
      return Response.json({ error: "Fetch failed" }, { status: 502 });
    }

    const reader = res.body?.getReader();
    let html = "";
    if (reader) {
      const decoder = new TextDecoder();
      let bytes = 0;
      while (bytes < 100_000) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        html += decoder.decode(value, { stream: true });
        bytes += value?.length ?? 0;
      }
      reader.cancel().catch(() => {
        // cancel after partial read; ignore
      });
    } else {
      html = await res.text();
    }

    const og = (prop: string) => extractMeta(html, "property", `og:${prop}`);
    const tw = (name: string) => extractMeta(html, "name", `twitter:${name}`);
    const meta = (name: string) => extractMeta(html, "name", name);

    const imageInput = og("image") ?? tw("image");
    const image = imageInput
      ? (parseHttpUrl(imageInput, finalUrl)?.toString() ?? null)
      : null;
    const title = og("title") ?? tw("title");
    const description =
      og("description") ?? tw("description") ?? meta("description");

    const domain = finalUrl.hostname.replace(WWW_RE, "");

    log.set({ og: { domain, hasImage: !!image, hasTitle: !!title } });
    log.emit({ status: 200 });

    return new Response(JSON.stringify({ image, title, description, domain }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    const evlogError = ensureEvlogError(error, "Failed to fetch OG metadata");
    log.error(evlogError);
    log.emit({ status: 502 });
    return Response.json({ error: "Fetch failed" }, { status: 502 });
  }
};
