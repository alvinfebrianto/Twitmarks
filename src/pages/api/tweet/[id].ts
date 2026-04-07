import type { APIRoute } from "astro";
import { createWorkersLogger } from "evlog/workers";
import { ensureEvlogError } from "../../../lib/evlog";
import { enrichNoteTweet } from "../../../lib/note-tweet";
import { buildSyndicationUrl } from "../../../lib/syndication";

export const prerender = false;

const TWEET_ID_RE = /^\d{1,20}$/;
const CACHE_CONTROL_HEADER = "public, max-age=3600, s-maxage=3600";

function getEdgeCache() {
  if (typeof caches === "undefined") {
    return null;
  }

  return (caches as CacheStorage & { default?: Cache }).default ?? null;
}

function buildCacheKey(request: Request) {
  return new Request(request.url, { method: "GET" });
}

export const GET: APIRoute = async ({ params, request, locals }) => {
  const log = createWorkersLogger(request);
  const id = params.id;

  if (!(id && TWEET_ID_RE.test(id))) {
    log.set({ tweet: { id, valid: false } });
    log.emit({ status: 400 });
    return Response.json({ data: null }, { status: 400 });
  }

  log.set({ tweet: { id } });

  const url = buildSyndicationUrl(id);

  try {
    const cache = getEdgeCache();
    const cacheKey = buildCacheKey(request);
    const cached = cache ? await cache.match(cacheKey) : null;

    if (cached) {
      log.set({ tweet: { cached: true, found: true, id } });
      log.emit({ status: 200 });
      return cached;
    }

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    const isJson = res.headers
      .get("content-type")
      ?.includes("application/json");

    if (!(res.ok && isJson)) {
      const status = res.ok ? 500 : 404;
      log.set({ tweet: { fetchStatus: res.status, found: false } });
      log.emit({ status });
      return Response.json({ data: null }, { status });
    }

    const data = await res.json();

    if (!data || (typeof data === "object" && Object.keys(data).length === 0)) {
      log.set({ tweet: { found: false } });
      log.emit({ status: 404 });
      return Response.json({ data: null }, { status: 404 });
    }

    const enriched = await enrichNoteTweet(data);

    log.set({ tweet: { found: true, noteTweetEnriched: enriched !== data } });
    log.emit({ status: 200 });

    const response = new Response(JSON.stringify({ data: enriched }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": CACHE_CONTROL_HEADER,
      },
    });

    if (cache) {
      const write = cache.put(cacheKey, response.clone());
      locals.runtime.ctx?.waitUntil?.(write);
      if (!locals.runtime.ctx?.waitUntil) {
        await write;
      }
    }

    return response;
  } catch (error) {
    const evlogError = ensureEvlogError(error, "Failed to fetch tweet data");
    log.error(evlogError);
    log.emit({ status: 500 });
    return Response.json({ data: null }, { status: 500 });
  }
};
