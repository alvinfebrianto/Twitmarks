import type { APIRoute } from "astro";
import { createWorkersLogger } from "evlog/workers";
import { getDbOrThrow } from "../../../lib/db";
import { ensureEvlogError } from "../../../lib/evlog";
import { enrichNoteTweet } from "../../../lib/note-tweet";
import {
  buildSyndicationRequestInit,
  buildSyndicationUrl,
  createTweetMediaProxySigner,
  rewriteTweetMediaUrls,
} from "../../../lib/syndication";

export const prerender = false;

const TWEET_ID_RE = /^\d{1,20}$/;
const CACHE_CONTROL_HEADER = "public, max-age=3600, s-maxage=3600";
const TWEET_CACHE_VERSION = "4";

function getEdgeCache() {
  if (typeof caches === "undefined") {
    return null;
  }

  return (caches as CacheStorage & { default?: Cache }).default ?? null;
}

function buildCacheKey(request: Request) {
  const cacheUrl = new URL(request.url);
  cacheUrl.searchParams.set("v", TWEET_CACHE_VERSION);
  return new Request(cacheUrl, { method: "GET" });
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
  const db = getDbOrThrow(locals);

  try {
    const cache = getEdgeCache();
    const cacheKey = buildCacheKey(request);
    const cached = cache ? await cache.match(cacheKey) : null;

    if (cached) {
      log.set({ tweet: { cached: true, found: true, id } });
      log.emit({ status: 200 });
      return cached;
    }

    const res = await fetch(url.toString(), buildSyndicationRequestInit());
    const isJson = res.headers
      .get("content-type")
      ?.includes("application/json");

    if (!(res.ok && isJson)) {
      log.set({
        tweet: {
          fetchStatus: res.status,
          found: false,
          contentType: res.headers.get("content-type"),
        },
      });
      log.emit({ status: 502 });
      return Response.json({ data: null }, { status: 502 });
    }

    const data = (await res.json()) as import("react-tweet/api").Tweet | null;

    if (!data || (typeof data === "object" && Object.keys(data).length === 0)) {
      log.set({ tweet: { found: false } });
      log.emit({ status: 404 });
      return Response.json({ data: null }, { status: 404 });
    }

    const enriched = await enrichNoteTweet(data);
    const signTweetMediaUrl = await createTweetMediaProxySigner(
      db,
      locals.runtime.env.ADMIN_SECRET
    );
    const signedTweet = await rewriteTweetMediaUrls(
      enriched,
      signTweetMediaUrl
    );

    log.set({ tweet: { found: true, noteTweetEnriched: enriched !== data } });
    log.emit({ status: 200 });

    const response = new Response(JSON.stringify({ data: signedTweet }), {
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
