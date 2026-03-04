import type { APIRoute } from "astro";
import { log } from "evlog";
import DOMPurify from "isomorphic-dompurify";
import { ensureEvlogError, errors, errorToObject } from "../../lib/evlog";

export const prerender = false;

const ALLOWED_URI_REGEX = /^(https?:\/\/)?(www\.)?(twitter\.com|x\.com)\/.*/i;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const db = locals.env.DB;
    const adminSecret = locals.env.ADMIN_SECRET;

    log.info("POST /api/tweets - Processing request", {
      hasAuthHeader: !!request.headers.get("Authorization"),
    });

    if (!db) {
      const error = errors.database("check database connection");
      return new Response(JSON.stringify(errorToObject(error)), {
        status: error.status,
        headers: { "Content-Type": "application/json" },
      });
    }

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
    if (token !== adminSecret) {
      const error = errors.unauthorized("Invalid token");
      return new Response(JSON.stringify(errorToObject(error)), {
        status: error.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await request.json();
    if (!body.embed_html || typeof body.embed_html !== "string") {
      const error = errors.badRequest(
        "embed_html",
        "embed_html is required and must be a string"
      );
      return new Response(JSON.stringify(errorToObject(error)), {
        status: error.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const sanitizedHtml = DOMPurify.sanitize(body.embed_html, {
      ADD_TAGS: ["twitter-blockquote", "twitter-video"],
      ADD_ATTR: ["url", "data-theme", "align", "class", "style"],
      ALLOWED_URI_REGEXP: ALLOWED_URI_REGEX,
    });

    const result = await db
      .prepare("INSERT INTO tweets (embed_html) VALUES (?)")
      .bind(sanitizedHtml)
      .run();

    log.info("POST /api/tweets - Tweet created successfully", {
      id: result.meta?.last_row_id,
    });

    return new Response(
      JSON.stringify({
        id: result.meta?.last_row_id,
        embed_html: sanitizedHtml,
        success: true,
      }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    const evlogError = ensureEvlogError(error, "Failed to add tweet");
    log.error("POST /api/tweets - Error:", {
      message: evlogError.message,
      status: evlogError.status,
      why: evlogError.why,
    });

    return new Response(JSON.stringify(errorToObject(evlogError)), {
      status: evlogError.status,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const GET: APIRoute = async ({ locals }) => {
  try {
    const db = locals.env.DB;

    log.info("GET /api/tweets - Fetching tweets");

    if (!db) {
      const error = errors.database("check database connection");
      return new Response(JSON.stringify(errorToObject(error)), {
        status: error.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = await db
      .prepare("SELECT * FROM tweets ORDER BY created_at DESC")
      .all();

    log.info(
      `GET /api/tweets - Retrieved ${result.results?.length ?? 0} tweets`
    );

    return new Response(JSON.stringify(result.results ?? []), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const evlogError = ensureEvlogError(error, "Failed to fetch tweets");
    log.error("GET /api/tweets - Error:", {
      message: evlogError.message,
      status: evlogError.status,
      why: evlogError.why,
    });

    return new Response(JSON.stringify(errorToObject(evlogError)), {
      status: evlogError.status,
      headers: { "Content-Type": "application/json" },
    });
  }
};
