import type { APIRoute } from "astro";
import { createWorkersLogger } from "evlog/workers";
import { requireAdminSession } from "../../lib/admin-session";
import { ensureEvlogError, errors, errorToObject } from "../../lib/evlog";
import { fetchTweetText } from "../../lib/fetch-tweet-text";
import { sanitizeTweetHtml } from "../../lib/sanitize-html";
import { ensureTweetsSearchTextColumn } from "../../lib/tweets-schema";

export const prerender = false;

const BARE_TWEET_PATH_RE = /^\/\w+\/status\/(\d+)\/?$/i;
const TWEET_HOSTS = new Set([
  "x.com",
  "www.x.com",
  "twitter.com",
  "www.twitter.com",
]);

function getDbOrThrow(locals: App.Locals): D1Database {
  const db = locals.runtime.env.DB;
  if (!db) {
    throw errors.database("check database connection");
  }
  return db;
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

async function readJsonObject(
  request: Request
): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw errors.badRequest("body", "Request body must be valid JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw errors.badRequest("body", "Request body must be a JSON object");
  }
  return body as Record<string, unknown>;
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

export const POST: APIRoute = async ({ request, locals }) => {
  const log = createWorkersLogger(request);
  try {
    log.set({
      api: { route: "POST /api/tweets" },
    });

    const db = getDbOrThrow(locals);
    await requireAdminSession(request, locals.runtime.env.ADMIN_SECRET);
    requireJsonContentType(request);

    const body = await readJsonObject(request);

    if (!body.embed_html || typeof body.embed_html !== "string") {
      throw errors.badRequest(
        "embed_html",
        "embed_html is required and must be a string"
      );
    }

    const rawInput = (body.embed_html as string).trim();
    const sanitizedHtml = sanitizeTweetHtml(rawInput);

    const bareTweet = parseBareTweetUrl(rawInput);

    if (!(bareTweet || sanitizedHtml.trim())) {
      throw errors.badRequest(
        "embed_html",
        "embed_html contained no allowed content after sanitization"
      );
    }

    const storedHtml = bareTweet ? bareTweet.canonicalUrl : sanitizedHtml;
    const searchText = bareTweet
      ? await fetchTweetText(bareTweet.tweetId)
      : null;

    await ensureTweetsSearchTextColumn(db);

    const result = await db
      .prepare(
        "INSERT INTO tweets (embed_html, search_text, sort_order) VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tweets))"
      )
      .bind(storedHtml, searchText)
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

    log.set({ tweet: { id: insertedId, sortOrder } });
    log.emit({ status: 201 });

    return jsonResponse(
      {
        id: insertedId,
        embed_html: storedHtml,
        search_text: searchText,
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

    const db = getDbOrThrow(locals);

    await ensureTweetsSearchTextColumn(db);

    const result = await db
      .prepare(
        "SELECT id, embed_html, search_text, sort_order, strftime('%Y-%m-%dT%H:%M:%fZ', created_at) AS created_at FROM tweets ORDER BY sort_order ASC, id ASC"
      )
      .all();

    const count = result.results?.length ?? 0;
    log.set({ tweets: { count } });
    log.emit({ status: 200 });

    return new Response(JSON.stringify(result.results ?? []), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=60, max-age=0, must-revalidate",
      },
    });
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
    await requireAdminSession(request, locals.runtime.env.ADMIN_SECRET);
    requireJsonContentType(request);

    const body = await readJsonObject(request);
    const id = readPositiveInt(body, "id");

    const result = await db
      .prepare("DELETE FROM tweets WHERE id = ?")
      .bind(id)
      .run();

    if (result.meta?.changes === 0) {
      throw errors.notFound("tweet");
    }

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
    await requireAdminSession(request, locals.runtime.env.ADMIN_SECRET);
    requireJsonContentType(request);

    const body = await readJsonObject(request);
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
