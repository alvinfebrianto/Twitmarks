import type { APIRoute } from "astro";
import { createWorkersLogger } from "evlog/workers";
import { requireAdminSession } from "../../lib/admin-session";
import { getDbOrThrow } from "../../lib/db";
import { ensureEvlogError, errors, errorToObject } from "../../lib/evlog";
import { readJsonObject } from "../../lib/request-body";
import {
  createTweetMediaProxySigner,
  rewriteTweetMediaUrls,
} from "../../lib/syndication";
import {
  fetchTweetSnapshot,
  parseStoredTweetData,
  serializeStoredTweetData,
} from "../../lib/tweet-snapshot";
import {
  ensureAdminSessionsSchema,
  ensureTweetsSearchTextColumn,
} from "../../lib/tweets-schema";

export const prerender = false;

const BARE_TWEET_PATH_RE = /^\/\w+\/status\/(\d+)\/?$/i;
const TWEET_HOSTS = new Set([
  "x.com",
  "www.x.com",
  "twitter.com",
  "www.twitter.com",
]);
const MAX_TWEETS_BODY_BYTES = 12_288;
const MAX_TWEET_URL_LENGTH = 2048;
const CACHE_CONTROL_HEADER = "public, s-maxage=60, max-age=0, must-revalidate";

function getEdgeCache() {
  if (typeof caches === "undefined") {
    return null;
  }

  return (caches as CacheStorage & { default?: Cache }).default ?? null;
}

function buildCacheKey(request: Request) {
  return new Request(request.url, { method: "GET" });
}

async function invalidateTweetsCache(
  request: Request,
  locals: App.Locals
): Promise<void> {
  const cache = getEdgeCache();
  if (!cache) {
    return;
  }

  const deletion = cache.delete(buildCacheKey(request));
  locals.runtime.ctx?.waitUntil?.(deletion);
  if (!locals.runtime.ctx?.waitUntil) {
    await deletion;
  }
}

function requireJsonContentType(request: Request): void {
  const contentType = request.headers.get("Content-Type") ?? "";
  const mediaType = contentType.split(";")[0]?.trim().toLowerCase();

  if (mediaType !== "application/json") {
    throw errors.badRequest(
      "Content-Type",
      "Content-Type must be application/json"
    );
  }
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(error: { status: number }) {
  return new Response(JSON.stringify(errorToObject(error as never)), {
    status: error.status,
    headers: { "Content-Type": "application/json" },
  });
}

function readPositiveInt(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw errors.badRequest(
      key,
      `${key} is required and must be a positive integer`
    );
  }
  return value as number;
}

function parseBareTweetUrl(
  input: string
): { canonicalUrl: string; tweetId: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return null;
  }

  if (!(parsed.protocol === "http:" || parsed.protocol === "https:")) {
    return null;
  }

  if (!TWEET_HOSTS.has(parsed.hostname.toLowerCase())) {
    return null;
  }

  const pathMatch = parsed.pathname.match(BARE_TWEET_PATH_RE);
  const tweetId = pathMatch?.[1];

  if (!tweetId) {
    return null;
  }

  const canonicalPath = parsed.pathname.endsWith("/")
    ? parsed.pathname.slice(0, -1)
    : parsed.pathname;

  return {
    canonicalUrl: `${parsed.origin}${canonicalPath}`,
    tweetId,
  };
}

function mapTweetRow(row: Record<string, unknown>): Record<string, unknown> & {
  tweet_data: ReturnType<typeof parseStoredTweetData>;
} {
  const { tweet_json: tweetJson, ...rest } = row;

  return {
    ...rest,
    tweet_data: parseStoredTweetData(tweetJson),
  };
}

export const POST: APIRoute = async ({ request, locals }) => {
  const log = createWorkersLogger(request);
  try {
    log.set({
      api: { route: "POST /api/tweets" },
    });

    const db = getDbOrThrow(locals);
    await ensureAdminSessionsSchema(db);
    await ensureTweetsSearchTextColumn(db);
    await requireAdminSession(request, db);
    requireJsonContentType(request);
    const signTweetMediaUrl = await createTweetMediaProxySigner(
      db,
      locals.runtime.env.ADMIN_SECRET
    );

    const body = await readJsonObject(request, MAX_TWEETS_BODY_BYTES);

    if (!body.embed_html || typeof body.embed_html !== "string") {
      throw errors.badRequest(
        "embed_html",
        "embed_html is required and must be a string"
      );
    }

    const rawInput = (body.embed_html as string).trim();
    if (!rawInput) {
      throw errors.badRequest(
        "embed_html",
        "embed_html is required and must be a string"
      );
    }

    if (rawInput.length > MAX_TWEET_URL_LENGTH) {
      throw errors.badRequest(
        "embed_html",
        `embed_html must be ${MAX_TWEET_URL_LENGTH} characters or fewer`
      );
    }

    const bareTweet = parseBareTweetUrl(rawInput);

    if (!bareTweet) {
      throw errors.badRequest(
        "embed_html",
        "embed_html must be a valid tweet URL"
      );
    }

    const storedHtml = bareTweet.canonicalUrl;
    const { searchText, tweetData } = await fetchTweetSnapshot(
      bareTweet.tweetId
    );

    if (!tweetData) {
      throw errors.badGateway(
        "Failed to fetch tweet snapshot from the syndication API"
      );
    }

    const serializedTweetData = serializeStoredTweetData(tweetData);
    const degradedTweet = await db
      .prepare(
        "SELECT id, sort_order, strftime('%Y-%m-%dT%H:%M:%fZ', created_at) AS created_at FROM tweets WHERE embed_html = ? AND (tweet_json IS NULL OR trim(tweet_json) = '' OR search_text IS NULL OR trim(search_text) = '') ORDER BY id ASC LIMIT 1"
      )
      .bind(storedHtml)
      .first<{ id: number; sort_order: number; created_at: string }>();

    if (degradedTweet) {
      await db
        .prepare(
          "UPDATE tweets SET search_text = ?, tweet_json = ? WHERE id = ?"
        )
        .bind(searchText, serializedTweetData, degradedTweet.id)
        .run();

      await invalidateTweetsCache(request, locals);

      log.set({
        tweet: { id: degradedTweet.id, sortOrder: degradedTweet.sort_order },
      });
      log.emit({ status: 200 });

      return jsonResponse({
        id: degradedTweet.id,
        embed_html: storedHtml,
        search_text: searchText,
        tweet_data: await rewriteTweetMediaUrls(tweetData, signTweetMediaUrl),
        sort_order: degradedTweet.sort_order,
        created_at: degradedTweet.created_at,
        repaired: true,
        success: true,
      });
    }

    const result = await db
      .prepare(
        "INSERT INTO tweets (embed_html, search_text, tweet_json, sort_order) VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tweets))"
      )
      .bind(storedHtml, searchText, serializedTweetData)
      .run();

    const insertedId = result.meta?.last_row_id;
    const createdTweet = insertedId
      ? await db
          .prepare(
            "SELECT sort_order, strftime('%Y-%m-%dT%H:%M:%fZ', created_at) AS created_at FROM tweets WHERE id = ?"
          )
          .bind(insertedId)
          .first<{ sort_order: number; created_at: string }>()
      : null;
    const sortOrder = createdTweet?.sort_order ?? 1;
    const createdAt = createdTweet?.created_at ?? new Date().toISOString();

    await invalidateTweetsCache(request, locals);

    log.set({ tweet: { id: insertedId, sortOrder } });
    log.emit({ status: 201 });

    return jsonResponse(
      {
        id: insertedId,
        embed_html: storedHtml,
        search_text: searchText,
        tweet_data: await rewriteTweetMediaUrls(tweetData, signTweetMediaUrl),
        sort_order: sortOrder,
        created_at: createdAt,
        success: true,
      },
      201
    );
  } catch (error) {
    const evlogError = ensureEvlogError(error, "Failed to add tweet");
    log.error(evlogError);
    log.emit({ status: evlogError.status });
    return errorResponse(evlogError);
  }
};

export const GET: APIRoute = async ({ request, locals }) => {
  const log = createWorkersLogger(request);
  try {
    log.set({ api: { route: "GET /api/tweets" } });

    const cache = getEdgeCache();
    const cacheKey = buildCacheKey(request);
    const cached = cache ? await cache.match(cacheKey) : null;

    if (cached) {
      log.set({ tweets: { cached: true } });
      log.emit({ status: 200 });
      return cached;
    }

    const db = getDbOrThrow(locals);
    await ensureTweetsSearchTextColumn(db);
    const signTweetMediaUrl = await createTweetMediaProxySigner(
      db,
      locals.runtime.env.ADMIN_SECRET
    );

    const result = await db
      .prepare(
        "SELECT id, embed_html, search_text, tweet_json, sort_order, strftime('%Y-%m-%dT%H:%M:%fZ', created_at) AS created_at FROM tweets ORDER BY sort_order ASC, id ASC"
      )
      .all<Record<string, unknown>>();

    const tweets = await Promise.all(
      (result.results ?? []).map(async (row: Record<string, unknown>) => {
        const tweet = mapTweetRow(row);

        return {
          ...tweet,
          tweet_data: await rewriteTweetMediaUrls(
            tweet.tweet_data,
            signTweetMediaUrl
          ),
        };
      })
    );

    const count = tweets.length;
    log.set({ tweets: { count } });
    log.emit({ status: 200 });

    const response = new Response(JSON.stringify(tweets), {
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
    const evlogError = ensureEvlogError(error, "Failed to fetch tweets");
    log.error(evlogError);
    log.emit({ status: evlogError.status });
    return errorResponse(evlogError);
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  const log = createWorkersLogger(request);
  try {
    log.set({ api: { route: "DELETE /api/tweets" } });

    const db = getDbOrThrow(locals);
    await ensureAdminSessionsSchema(db);
    await requireAdminSession(request, db);
    requireJsonContentType(request);

    const body = await readJsonObject(request, MAX_TWEETS_BODY_BYTES);
    const id = readPositiveInt(body, "id");

    const result = await db
      .prepare("DELETE FROM tweets WHERE id = ?")
      .bind(id)
      .run();

    if (result.meta?.changes === 0) {
      throw errors.notFound("tweet");
    }

    await invalidateTweetsCache(request, locals);

    log.set({ tweet: { id } });
    log.emit({ status: 200 });

    return jsonResponse({ success: true, id });
  } catch (error) {
    const evlogError = ensureEvlogError(error, "Failed to delete tweet");
    log.error(evlogError);
    log.emit({ status: evlogError.status });
    return errorResponse(evlogError);
  }
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  const log = createWorkersLogger(request);
  try {
    log.set({ api: { route: "PATCH /api/tweets" } });

    const db = getDbOrThrow(locals);
    await ensureAdminSessionsSchema(db);
    await requireAdminSession(request, db);
    requireJsonContentType(request);

    const body = await readJsonObject(request, MAX_TWEETS_BODY_BYTES);
    const movedId = readPositiveInt(body, "movedId");
    const targetId = readPositiveInt(body, "targetId");

    if (movedId === targetId) {
      throw errors.badRequest(
        "movedId/targetId",
        "movedId and targetId must be different"
      );
    }

    const [movedTweet, targetTweet] = await Promise.all([
      db
        .prepare("SELECT sort_order FROM tweets WHERE id = ?")
        .bind(movedId)
        .first<{ sort_order: number }>(),
      db
        .prepare("SELECT sort_order FROM tweets WHERE id = ?")
        .bind(targetId)
        .first<{ sort_order: number }>(),
    ]);

    if (!(movedTweet && targetTweet)) {
      throw errors.notFound("tweet");
    }

    await db.batch([
      db
        .prepare("UPDATE tweets SET sort_order = ? WHERE id = ?")
        .bind(targetTweet.sort_order, movedId),
      db
        .prepare("UPDATE tweets SET sort_order = ? WHERE id = ?")
        .bind(movedTweet.sort_order, targetId),
    ]);

    await invalidateTweetsCache(request, locals);

    log.set({ swap: { movedId, targetId } });
    log.emit({ status: 200 });

    return jsonResponse({ success: true });
  } catch (error) {
    const evlogError = ensureEvlogError(error, "Failed to swap tweets");
    log.error(evlogError);
    log.emit({ status: evlogError.status });
    return errorResponse(evlogError);
  }
};
