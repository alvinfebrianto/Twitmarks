import type { APIRoute } from "astro";

export const prerender = false;

const ALLOWED_RE = /^https?:\/\//;
const WWW_RE = /^www\./;

function extractMeta(html: string, attr: string, value: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:${attr})=["']${value}["'][^>]+content=["']([^"'<>]+)["']` +
      `|<meta[^>]+content=["']([^"'<>]+)["'][^>]+(?:${attr})=["']${value}["']`,
    "i"
  );
  const m = html.match(re);
  const raw = m?.[1] ?? m?.[2] ?? null;
  return raw ? decodeHtmlEntities(raw) : null;
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

export const GET: APIRoute = async ({ url }) => {
  const target = url.searchParams.get("url");
  if (!(target && ALLOWED_RE.test(target))) {
    return Response.json({ error: "Invalid url" }, { status: 400 });
  }

  try {
    const res = await fetch(target, {
      headers: {
        "User-Agent": "Twitterbot/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
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

    let image = og("image") ?? tw("image");
    const title = og("title") ?? tw("title");
    const description =
      og("description") ?? tw("description") ?? meta("description");

    const targetUrl = new URL(target);
    const domain = targetUrl.hostname.replace(WWW_RE, "");

    if (image && !ALLOWED_RE.test(image)) {
      image = new URL(image, target).toString();
    }

    return new Response(JSON.stringify({ image, title, description, domain }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return Response.json({ error: "Fetch failed" }, { status: 502 });
  }
};
