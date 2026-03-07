import type { APIRoute } from "astro";
import { log } from "evlog";
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

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const db = locals.runtime.env.DB;
    const adminSecret = locals.runtime.env.ADMIN_SECRET;

    log.info({
      tag: "api",
      message: "POST /api/tweets - Processing request",
      hasAuthHeader: !!request.headers.get("Authorization"),
    });

    if (!db) {
      return errorResponse(errors.database("check database connection"));
    }

    const authError = await verifyAdmin(request, adminSecret);
    if (authError) {
      return authError;
    }

    const body = (await request.json()) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return errorResponse(
        errors.badRequest("body", "Request body must be a JSON object")
      );
    }
    if (!body.embed_html || typeof body.embed_html !== "string") {
      return errorResponse(
        errors.badRequest(
          "embed_html",
          "embed_html is required and must be a string"
        )
      );
    }

    const sanitizedHtml = DOMPurify.sanitize(body.embed_html, {
      ADD_TAGS: ["twitter-blockquote", "twitter-video"],
      ADD_ATTR: ["url", "data-theme", "align", "class", "style"],
      ALLOWED_URI_REGEXP: ALLOWED_URI_REGEX,
    });
    if (!sanitizedHtml.trim()) {
      return errorResponse(
        errors.badRequest(
          "embed_html",
          "embed_html contained no allowed content after sanitization"
        )
      );
    }

    const nextOrder = await db
      .prepare(
        "SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_sort_order FROM tweets"
      )
      .first<{ next_sort_order: number }>();
    const sortOrder = nextOrder?.next_sort_order ?? 1;

    const result = await db
      .prepare("INSERT INTO tweets (embed_html, sort_order) VALUES (?, ?)")
      .bind(sanitizedHtml, sortOrder)
      .run();

    log.info({
      tag: "api",
      message: "POST /api/tweets - Tweet created successfully",
      id: result.meta?.last_row_id,
    });

    return jsonResponse(
      {
        id: result.meta?.last_row_id,
        embed_html: sanitizedHtml,
        sort_order: sortOrder,
        success: true,
      },
      201
    );
  } catch (error) {
    const evlogError = ensureEvlogError(error, "Failed to add tweet");
    log.error({
      tag: "api",
      message: "POST /api/tweets - Error",
      error: evlogError.message,
      status: evlogError.status,
      why: evlogError.why,
    });

    return errorResponse(evlogError);
  }
};

export const GET: APIRoute = async ({ locals }) => {
  try {
    const db = locals.runtime.env.DB;

    log.info({
      tag: "api",
      message: "GET /api/tweets - Fetching tweets",
    });

    if (!db) {
      return errorResponse(errors.database("check database connection"));
    }

    const result = await db
      .prepare("SELECT * FROM tweets ORDER BY sort_order ASC, id ASC")
      .all();

    log.info({
      tag: "api",
      message: `GET /api/tweets - Retrieved ${result.results?.length ?? 0} tweets`,
    });

    return jsonResponse(result.results ?? []);
  } catch (error) {
    const evlogError = ensureEvlogError(error, "Failed to fetch tweets");
    log.error({
      tag: "api",
      message: "GET /api/tweets - Error",
      error: evlogError.message,
      status: evlogError.status,
      why: evlogError.why,
    });

    return errorResponse(evlogError);
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  try {
    const db = locals.runtime.env.DB;
    const adminSecret = locals.runtime.env.ADMIN_SECRET;

    log.info({
      tag: "api",
      message: "DELETE /api/tweets - Processing request",
    });

    if (!db) {
      return errorResponse(errors.database("check database connection"));
    }

    const authError = await verifyAdmin(request, adminSecret);
    if (authError) {
      return authError;
    }

    const body = (await request.json()) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return errorResponse(
        errors.badRequest("body", "Request body must be a JSON object")
      );
    }
    if (!body.id || typeof body.id !== "number") {
      return errorResponse(
        errors.badRequest("id", "id is required and must be a number")
      );
    }

    const result = await db
      .prepare("DELETE FROM tweets WHERE id = ?")
      .bind(body.id)
      .run();

    if (result.meta?.changes === 0) {
      return errorResponse(errors.notFound("tweet"));
    }

    log.info({
      tag: "api",
      message: "DELETE /api/tweets - Tweet deleted",
      id: body.id,
    });

    return jsonResponse({ success: true, id: body.id });
  } catch (error) {
    const evlogError = ensureEvlogError(error, "Failed to delete tweet");
    log.error({
      tag: "api",
      message: "DELETE /api/tweets - Error",
      error: evlogError.message,
      status: evlogError.status,
      why: evlogError.why,
    });

    return errorResponse(evlogError);
  }
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  try {
    const db = locals.runtime.env.DB;
    const adminSecret = locals.runtime.env.ADMIN_SECRET;

    log.info({
      tag: "api",
      message: "PATCH /api/tweets - Processing reorder request",
    });

    if (!db) {
      return errorResponse(errors.database("check database connection"));
    }

    const authError = await verifyAdmin(request, adminSecret);
    if (authError) {
      return authError;
    }

    const body = (await request.json()) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return errorResponse(
        errors.badRequest("body", "Request body must be a JSON object")
      );
    }
    if (!Array.isArray(body.orderedIds) || body.orderedIds.length === 0) {
      return errorResponse(
        errors.badRequest(
          "orderedIds",
          "orderedIds is required and must be a non-empty array"
        )
      );
    }

    const orderedIds = body.orderedIds as number[];

    if (!orderedIds.every((id) => Number.isInteger(id))) {
      return errorResponse(
        errors.badRequest("orderedIds", "All IDs must be integers")
      );
    }

    const uniqueIds = new Set(orderedIds);
    if (uniqueIds.size !== orderedIds.length) {
      return errorResponse(
        errors.badRequest(
          "orderedIds",
          "orderedIds must not contain duplicates"
        )
      );
    }

    const existing = await db
      .prepare("SELECT id FROM tweets ORDER BY sort_order ASC, id ASC")
      .all<{ id: number }>();
    const dbIds = new Set(
      (existing.results ?? []).map((r: { id: number }) => r.id)
    );

    if (
      uniqueIds.size !== dbIds.size ||
      !orderedIds.every((id) => dbIds.has(id))
    ) {
      return errorResponse(
        errors.badRequest(
          "orderedIds",
          "orderedIds must match the full set of tweet IDs"
        )
      );
    }

    await db.batch(
      orderedIds.map((id, index) =>
        db
          .prepare("UPDATE tweets SET sort_order = ? WHERE id = ?")
          .bind(index + 1, id)
      )
    );

    log.info({
      tag: "api",
      message: "PATCH /api/tweets - Reorder complete",
      count: orderedIds.length,
    });

    return jsonResponse({ success: true });
  } catch (error) {
    const evlogError = ensureEvlogError(error, "Failed to reorder tweets");
    log.error({
      tag: "api",
      message: "PATCH /api/tweets - Error",
      error: evlogError.message,
      status: evlogError.status,
      why: evlogError.why,
    });

    return errorResponse(evlogError);
  }
};
