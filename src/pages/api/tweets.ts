import type { APIRoute } from "astro";
import { createWorkersLogger } from "evlog/workers";
import DOMPurify from "isomorphic-dompurify";
import { ensureEvlogError, errors, errorToObject } from "../../lib/evlog";

export const prerender = false;

const ALLOWED_URI_REGEX =
  /^(https?:\/\/)?(www\.)?(twitter\.com|x\.com|t\.co|pic\.twitter\.com|platform\.twitter\.com|pbs\.twimg\.com|video\.twimg\.com)\//i;

async function verifyAdmin(
  request: Request,
  adminSecret: string | undefined
): Promise<Response | null> {
  if (!adminSecret) {
    const error = errors.internal("ADMIN_SECRET not configured");
    return new Response(JSON.stringify(errorToObject(error)), {
      status: error.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    const error = errors.unauthorized(
      "Missing Bearer token in Authorization header"
    );
    return new Response(JSON.stringify(errorToObject(error)), {
      status: error.status,
      headers: { "Content-Type": "application/json" },
    });
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
    const error = errors.unauthorized("Invalid token");
    return new Response(JSON.stringify(errorToObject(error)), {
      status: error.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  return null;
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

async function parseJsonBody(
  request: Request
): Promise<Record<string, unknown> | Response> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return errorResponse(
        errors.badRequest("body", "Request body must be a JSON object")
      );
    }
    return body as Record<string, unknown>;
  } catch {
    return errorResponse(
      errors.badRequest("body", "Request body must be valid JSON")
    );
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  const log = createWorkersLogger(request);
  try {
    const db = locals.runtime.env.DB;
    const adminSecret = locals.runtime.env.ADMIN_SECRET;

    log.set({
      api: {
        route: "POST /api/tweets",
        hasAuth: !!request.headers.get("Authorization"),
      },
    });

    if (!db) {
      const error = errors.database("check database connection");
      log.emit({ status: error.status });
      return errorResponse(error);
    }

    const authError = await verifyAdmin(request, adminSecret);
    if (authError) {
      log.emit({ status: authError.status });
      return authError;
    }

    const bodyOrError = await parseJsonBody(request);
    if (bodyOrError instanceof Response) {
      log.emit({ status: 400 });
      return bodyOrError;
    }
    const body = bodyOrError;

    if (!body.embed_html || typeof body.embed_html !== "string") {
      const error = errors.badRequest(
        "embed_html",
        "embed_html is required and must be a string"
      );
      log.emit({ status: error.status });
      return errorResponse(error);
    }

    const sanitizedHtml = DOMPurify.sanitize(body.embed_html, {
      ADD_TAGS: ["twitter-blockquote", "twitter-video"],
      ADD_ATTR: ["url", "data-theme", "align", "class"],
      ALLOWED_URI_REGEXP: ALLOWED_URI_REGEX,
    });
    if (!sanitizedHtml.trim()) {
      const error = errors.badRequest(
        "embed_html",
        "embed_html contained no allowed content after sanitization"
      );
      log.emit({ status: error.status });
      return errorResponse(error);
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
    const db = locals.runtime.env.DB;

    log.set({ api: { route: "GET /api/tweets" } });

    if (!db) {
      const error = errors.database("check database connection");
      log.emit({ status: error.status });
      return errorResponse(error);
    }

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
    const db = locals.runtime.env.DB;
    const adminSecret = locals.runtime.env.ADMIN_SECRET;

    log.set({ api: { route: "DELETE /api/tweets" } });

    if (!db) {
      const error = errors.database("check database connection");
      log.emit({ status: error.status });
      return errorResponse(error);
    }

    const authError = await verifyAdmin(request, adminSecret);
    if (authError) {
      log.emit({ status: authError.status });
      return authError;
    }

    const bodyOrError = await parseJsonBody(request);
    if (bodyOrError instanceof Response) {
      log.emit({ status: 400 });
      return bodyOrError;
    }
    const body = bodyOrError;

    if (!Number.isInteger(body.id) || (body.id as number) < 1) {
      const error = errors.badRequest(
        "id",
        "id is required and must be a positive integer"
      );
      log.emit({ status: error.status });
      return errorResponse(error);
    }

    const result = await db
      .prepare("DELETE FROM tweets WHERE id = ?")
      .bind(body.id)
      .run();

    if (result.meta?.changes === 0) {
      const error = errors.notFound("tweet");
      log.emit({ status: error.status });
      return errorResponse(error);
    }

    log.set({ tweet: { id: body.id } });
    log.emit({ status: 200 });

    return jsonResponse({ success: true, id: body.id });
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
    const db = locals.runtime.env.DB;
    const adminSecret = locals.runtime.env.ADMIN_SECRET;

    log.set({ api: { route: "PATCH /api/tweets" } });

    if (!db) {
      const error = errors.database("check database connection");
      log.emit({ status: error.status });
      return errorResponse(error);
    }

    const authError = await verifyAdmin(request, adminSecret);
    if (authError) {
      log.emit({ status: authError.status });
      return authError;
    }

    const bodyOrError = await parseJsonBody(request);
    if (bodyOrError instanceof Response) {
      log.emit({ status: 400 });
      return bodyOrError;
    }
    const body = bodyOrError;

    if (
      !(Number.isInteger(body.movedId) && Number.isInteger(body.targetId)) ||
      (body.movedId as number) < 1 ||
      (body.targetId as number) < 1
    ) {
      const error = errors.badRequest(
        "movedId/targetId",
        "movedId and targetId are required and must be positive integers"
      );
      log.emit({ status: error.status });
      return errorResponse(error);
    }

    if (body.movedId === body.targetId) {
      const error = errors.badRequest(
        "movedId/targetId",
        "movedId and targetId must be different"
      );
      log.emit({ status: error.status });
      return errorResponse(error);
    }

    const [movedTweet, targetTweet] = await Promise.all([
      db
        .prepare("SELECT sort_order FROM tweets WHERE id = ?")
        .bind(body.movedId)
        .first<{ sort_order: number }>(),
      db
        .prepare("SELECT sort_order FROM tweets WHERE id = ?")
        .bind(body.targetId)
        .first<{ sort_order: number }>(),
    ]);

    if (!(movedTweet && targetTweet)) {
      const error = errors.notFound("tweet");
      log.emit({ status: error.status });
      return errorResponse(error);
    }

    await db.batch([
      db
        .prepare("UPDATE tweets SET sort_order = ? WHERE id = ?")
        .bind(targetTweet.sort_order, body.movedId),
      db
        .prepare("UPDATE tweets SET sort_order = ? WHERE id = ?")
        .bind(movedTweet.sort_order, body.targetId),
    ]);

    log.set({ swap: { movedId: body.movedId, targetId: body.targetId } });
    log.emit({ status: 200 });

    return jsonResponse({ success: true });
  } catch (error) {
    const evlogError = ensureEvlogError(error, "Failed to swap tweets");
    log.error(evlogError);
    log.emit({ status: evlogError.status });
    return errorResponse(evlogError);
  }
};
