import type { APIRoute } from "astro";
import { createWorkersLogger } from "evlog/workers";
import { getDbOrThrow } from "../../../lib/db";
import { ensureEvlogError } from "../../../lib/evlog";
import {
  parseTweetMediaUrl,
  verifyTweetMediaProxyRequest,
} from "../../../lib/syndication";

export const prerender = false;

const FORWARDED_REQUEST_HEADERS = [
  "Accept",
  "If-Range",
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
const MEDIA_PROXY_USER_AGENT =
  "Mozilla/5.0 (compatible; Twitmarks/1.0; +https://twitmarks.alvinpelajar.workers.dev)";

function getProxyFetchErrorDetails(error: unknown) {
  return error instanceof Error
    ? {
        errorMessage: error.message,
        errorName: error.name,
      }
    : { errorMessage: String(error), errorName: typeof error };
}

async function handleMediaRequest(
  request: Request,
  locals: App.Locals
): Promise<Response> {
  const log = createWorkersLogger(request);
  const requestedMediaUrl = parseTweetMediaUrl(
    new URL(request.url).searchParams.get("url") ?? ""
  );

  if (!requestedMediaUrl) {
    log.set({ tweetMedia: { valid: false } });
    log.emit({ status: 400 });
    return new Response(null, { status: 400 });
  }

  const mediaUrl = await verifyTweetMediaProxyRequest(
    request,
    getDbOrThrow(locals),
    locals.runtime.env.ADMIN_SECRET
  );

  if (!mediaUrl) {
    log.set({
      tweetMedia: {
        authorized: false,
        host: requestedMediaUrl.hostname,
        valid: true,
      },
    });
    log.emit({ status: 403 });
    return new Response(null, { status: 403 });
  }

  log.set({
    tweetMedia: { authorized: true, host: mediaUrl.hostname, valid: true },
  });

  const upstreamHeaders = new Headers();
  upstreamHeaders.set("User-Agent", MEDIA_PROXY_USER_AGENT);

  for (const header of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(header);
    if (value) {
      upstreamHeaders.set(header, value);
    }
  }

  try {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, PROXY_TIMEOUT_MS);

    let upstreamResponse: Response;
    try {
      upstreamResponse = await fetch(mediaUrl, {
        method: request.method,
        headers: upstreamHeaders,
        redirect: "manual",
        signal: abortController.signal,
      });
    } catch (error) {
      log.set({
        tweetMedia: {
          fetchFailed: true,
          ...getProxyFetchErrorDetails(error),
        },
      });

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    if (upstreamResponse.status >= 300 && upstreamResponse.status < 400) {
      log.set({
        tweetMedia: {
          location: upstreamResponse.headers.get("Location"),
          status: upstreamResponse.status,
        },
      });
      log.emit({ status: 502 });
      return new Response(null, { status: 502 });
    }

    const responseHeaders = new Headers();

    for (const header of FORWARDED_RESPONSE_HEADERS) {
      if (header === "Content-Length" && request.method !== "HEAD") {
        continue;
      }

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

    return new Response(
      request.method === "HEAD" ? null : upstreamResponse.body,
      {
        headers: responseHeaders,
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
      }
    );
  } catch (error) {
    const evlogError = ensureEvlogError(error, "Failed to proxy tweet media");

    log.error(evlogError);
    log.emit({ status: 502 });

    return new Response(null, { status: 502 });
  }
}

export const GET: APIRoute = async ({ request, locals }) =>
  handleMediaRequest(request, locals);
export const HEAD: APIRoute = async ({ request, locals }) =>
  handleMediaRequest(request, locals);
