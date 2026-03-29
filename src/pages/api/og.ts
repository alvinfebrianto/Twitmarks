import type { APIRoute } from "astro";
import { createWorkersLogger } from "evlog/workers";
import { getDbOrThrow } from "../../lib/db";
import { ensureEvlogError, errors, errorToObject } from "../../lib/evlog";
import { enforceRateLimit } from "../../lib/rate-limit";
import { ensureDatabaseSchema } from "../../lib/tweets-schema";

export const prerender = false;

const DNS_QUERY_URL = "https://cloudflare-dns.com/dns-query";
const HTML_CONTENT_TYPE_RE = /^(text\/html|application\/xhtml\+xml)\b/i;
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

function isPrivateIpv4(value: string): boolean {
  const octets = value.split(".").map(Number);
  const [a, b] = octets;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

function isPrivateIpv6(value: string): boolean {
  const normalized = value.toLowerCase();

  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
}

function isPrivateOrReservedIp(value: string): boolean {
  return IPV4_RE.test(value) ? isPrivateIpv4(value) : isPrivateIpv6(value);
}

async function resolveHostname(hostname: string): Promise<string[]> {
  const recordTypes = ["A", "AAAA"];
  const lookups = await Promise.all(
    recordTypes.map(async (type) => {
      const response = await fetch(
        `${DNS_QUERY_URL}?name=${encodeURIComponent(hostname)}&type=${type}`,
        {
          headers: { Accept: "application/dns-json" },
          redirect: "error",
          signal: AbortSignal.timeout(5000),
        }
      );

      if (!response.ok) {
        throw new Error("DNS lookup failed");
      }

      const body = (await response.json()) as {
        Answer?: Array<{ data?: string }>;
      };

      return (body.Answer ?? [])
        .map((answer) => answer.data?.trim())
        .filter((value): value is string => Boolean(value));
    })
  );

  return lookups.flat();
}

async function assertPublicHostname(hostname: string): Promise<void> {
  const answers = await resolveHostname(hostname);

  if (answers.length === 0) {
    throw errors.badRequest("url", "url could not be resolved");
  }

  if (answers.some((answer) => isPrivateOrReservedIp(answer))) {
    throw errors.badRequest("url", "url resolves to a non-public address");
  }
}

const MAX_REDIRECT_HOPS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

async function fetchWithValidatedRedirects(initialUrl: URL): Promise<{
  response: Response;
  finalUrl: URL;
}> {
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    await assertPublicHostname(currentUrl.hostname);

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

async function readHtml(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return await response.text();
  }

  const decoder = new TextDecoder();
  let bytes = 0;
  let html = "";

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

  return html;
}

function buildOgPayload(html: string, finalUrl: URL) {
  const og = (prop: string) => extractMeta(html, "property", `og:${prop}`);
  const tw = (name: string) => extractMeta(html, "name", `twitter:${name}`);
  const meta = (name: string) => extractMeta(html, "name", name);

  const imageInput = og("image") ?? tw("image");
  const image = imageInput
    ? (parseHttpUrl(imageInput, finalUrl)?.toString() ?? null)
    : null;

  return {
    description: og("description") ?? tw("description") ?? meta("description"),
    domain: finalUrl.hostname.replace(WWW_RE, ""),
    image,
    title: og("title") ?? tw("title"),
  };
}

async function fetchOgPayload(targetUrl: URL) {
  const { response, finalUrl } = await fetchWithValidatedRedirects(targetUrl);

  if (!response.ok) {
    throw new Error("Fetch failed");
  }

  const contentType = response.headers.get("Content-Type") ?? "";
  if (!HTML_CONTENT_TYPE_RE.test(contentType)) {
    throw new Error("Fetch failed");
  }

  return buildOgPayload(await readHtml(response), finalUrl);
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

function errorResponse(error: { retryAfter?: number; status: number }) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
  });

  if (typeof error.retryAfter === "number") {
    headers.set("Retry-After", String(error.retryAfter));
  }

  return new Response(JSON.stringify(errorToObject(error as never)), {
    status: error.status,
    headers,
  });
}

function getPublicErrorStatus(status: number): number {
  if (status === 400 || status === 429) {
    return status;
  }

  return 502;
}

export const GET: APIRoute = async ({ url, request, locals }) => {
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
    const db = getDbOrThrow(locals);
    await ensureDatabaseSchema(db);
    await enforceRateLimit(db, request, {
      limit: 30,
      scope: "og",
      windowSeconds: 60,
    });

    const payload = await fetchOgPayload(targetUrl);

    log.set({
      og: {
        domain: payload.domain,
        hasImage: !!payload.image,
        hasTitle: !!payload.title,
      },
    });
    log.emit({ status: 200 });

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    const evlogError = ensureEvlogError(error, "Failed to fetch OG metadata");
    const status = getPublicErrorStatus(evlogError.status);

    log.error(evlogError);
    log.emit({ status });

    if (status === 400 || status === 429) {
      return errorResponse(evlogError as never);
    }

    return Response.json({ error: "Fetch failed" }, { status: 502 });
  }
};
