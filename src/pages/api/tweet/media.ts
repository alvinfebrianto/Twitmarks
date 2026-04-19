import type { APIRoute } from "astro";
import { createWorkersLogger } from "evlog/workers";
import { ensureEvlogError } from "../../../lib/evlog";
import { parseTweetMediaUrl } from "../../../lib/syndication";

export const prerender = false;

const FORWARDED_REQUEST_HEADERS = [
  "Accept",
  "If-Modified-Since",
  "If-None-Match",
  "Range",
] as const;
const FORWARDED_RESPONSE_HEADERS = [
  "Accept-Ranges",
  "Cache-Control",
  "Content-Length",
  "Content-Range",
  "Content-Type",
  "ETag",
  "Last-Modified",
] as const;
const PROXY_TIMEOUT_MS = 10_000;
const DEFAULT_CACHE_CONTROL_HEADER = "public, max-age=604800, s-maxage=604800";

async function handleMediaRequest(request: Request): Promise<Response> {
  const log = createWorkersLogger(request);
  const mediaUrl = parseTweetMediaUrl(
    new URL(request.url).searchParams.get("url") ?? ""
  );

  if (!mediaUrl) {
    log.set({ tweetMedia: { valid: false } });
    log.emit({ status: 400 });
    return new Response(null, { status: 400 });
  }

  log.set({ tweetMedia: { host: mediaUrl.hostname, valid: true } });

  const upstreamHeaders = new Headers();
  for (const header of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(header);
    if (value) {
      upstreamHeaders.set(header, value);
    }
  }

  try {
    const upstreamResponse = await fetch(mediaUrl, {
      method: request.method,
      headers: upstreamHeaders,
      redirect: "error",
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    });
    const responseHeaders = new Headers();

    for (const header of FORWARDED_RESPONSE_HEADERS) {
      const value = upstreamResponse.headers.get(header);
      if (value) {
        responseHeaders.set(header, value);
      }
    }

    if (!responseHeaders.has("Cache-Control")) {
      responseHeaders.set("Cache-Control", DEFAULT_CACHE_CONTROL_HEADER);
    }

    log.set({
      tweetMedia: {
        contentType: upstreamResponse.headers.get("Content-Type"),
        status: upstreamResponse.status,
      },
    });
    log.emit({ status: upstreamResponse.status });

    return new Response(upstreamResponse.body, {
      headers: responseHeaders,
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
    });
  } catch (error) {
    const evlogError = ensureEvlogError(error, "Failed to proxy tweet media");

    log.error(evlogError);
    log.emit({ status: 502 });

    return new Response(null, { status: 502 });
  }
}

export const GET: APIRoute = async ({ request }) => handleMediaRequest(request);
export const HEAD: APIRoute = async ({ request }) =>
  handleMediaRequest(request);
