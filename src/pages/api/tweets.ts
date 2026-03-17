import type { APIRoute } from "astro";
import { createWorkersLogger } from "evlog/workers";
import DOMPurify from "isomorphic-dompurify";
import { ensureEvlogError, errors, errorToObject } from "../../lib/evlog";

export const prerender = false;

const ALLOWED_URI_REGEX =
  /^(https?:\/\/)?(www\.)?(twitter\.com|x\.com|t\.co|pic\.twitter\.com|platform\.twitter\.com|pbs\.twimg\.com|video\.twimg\.com)\//i;

function getDbOrThrow(locals: App.Locals): D1Database {
  const db = locals.runtime.env.DB;
  if (!db) {
    throw errors.database("check database connection");
  }
  return db;
}

async function requireAdmin(
  request: Request,
  adminSecret: string | undefined
): Promise<void> {
  if (!adminSecret) {
    throw errors.internal("ADMIN_SECRET not configured");
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw errors.unauthorized("Missing Bearer token in Authorization header");
  }

  const token = authHeader.substring(7);
  const encoder = new TextEncoder();
  const [tokenHashBuffer, secretHashBuffer] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(token)),
    crypto.subtle.digest("SHA-256", encoder.encode(adminSecret)),
  ]);
  const tokenHash = new Uint8Array(tokenHashBuffer);
  const secretHash = new Uint8Array(secretHashBuffer);

  let hashDiff = 0;
  for (let i = 0; i < tokenHash.length; i++) {
    // biome-ignore lint/suspicious/noBitwiseOperators: constant-time comparison requires bitwise XOR and OR
    hashDiff |= tokenHash[i] ^ secretHash[i];
  }
  const isValid = tokenHash.length === secretHash.length && hashDiff === 0;
  if (!isValid) {
    throw errors.unauthorized("Invalid token");
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

export const POST: APIRoute = async ({ request, locals }) => {
  const log = createWorkersLogger(request);
  try {
    log.set({
      api: {
        route: "POST /api/tweets",
        hasAuth: !!request.headers.get("Authorization"),
      },
    });

    const db = getDbOrThrow(locals);
    await requireAdmin(request, locals.runtime.env.ADMIN_SECRET);

    const body = await readJsonObject(request);

    if (!body.embed_html || typeof body.embed_html !== "string") {
      throw errors.badRequest(
        "embed_html",
        "embed_html is required and must be a string"
      );
    }

    const sanitizedHtml = DOMPurify.sanitize(body.embed_html, {
      ADD_TAGS: ["twitter-blockquote", "twitter-video"],
      ADD_ATTR: ["url", "data-theme", "align", "class"],
      ALLOWED_URI_REGEXP: ALLOWED_URI_REGEX,
    });
    if (!sanitizedHtml.trim()) {
      throw errors.badRequest(
        "embed_html",
        "embed_html contained no allowed content after sanitization"
      );
    }

    const result = await db
      .prepare(
        "INSERT INTO tweets (embed_html, sort_order) VALUES (?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tweets))"
      )
      .bind(sanitizedHtml)
      .run();

    const tweetId = result.meta?.last_row_id;
    const createdTweet = tweetId
      ? await db
          .prepare(
            "SELECT sort_order, strftime('%Y-%m-%dT%H:%M:%fZ', created_at) AS created_at FROM tweets WHERE id = ?"
          )
          .bind(tweetId)
          .first<{ sort_order: number; created_at: string }>()
      : null;
    const sortOrder = createdTweet?.sort_order ?? 1;
    const createdAt = createdTweet?.created_at ?? new Date().toISOString();

    log.set({ tweet: { id: tweetId, sortOrder } });
    log.emit({ status: 201 });

    return jsonResponse(
      {
        id: tweetId,
        embed_html: sanitizedHtml,
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

    const result = await db
      .prepare(
        "SELECT id, embed_html, sort_order, strftime('%Y-%m-%dT%H:%M:%fZ', created_at) AS created_at FROM tweets ORDER BY sort_order ASC, id ASC"
      )
      .all();

    const count = result.results?.length ?? 0;
    log.set({ tweets: { count } });
    log.emit({ status: 200 });

    return jsonResponse(result.results ?? []);
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
    await requireAdmin(request, locals.runtime.env.ADMIN_SECRET);

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
    await requireAdmin(request, locals.runtime.env.ADMIN_SECRET);

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
