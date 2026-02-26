import type { APIRoute } from "astro";
import DOMPurify from "isomorphic-dompurify";

export const prerender = false;

// Top-level regex for performance
const ALLOWED_URI_REGEX = /^(https?:\/\/)?(www\.)?(twitter\.com|x\.com)\/.*/i;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const db = locals.env.DB;
    const adminSecret = locals.env.ADMIN_SECRET;

    if (!db) {
      return new Response(JSON.stringify({ error: "Database not available" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!adminSecret) {
      return new Response(
        JSON.stringify({ error: "ADMIN_SECRET not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify authorization header
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Missing authorization header" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.substring(7);
    if (token !== adminSecret) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid token" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    if (!body.embed_html || typeof body.embed_html !== "string") {
      return new Response(
        JSON.stringify({ error: "Invalid request: embed_html is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Sanitize embed HTML to prevent XSS
    const sanitizedHtml = DOMPurify.sanitize(body.embed_html, {
      ADD_TAGS: ["twitter-blockquote", "twitter-video"],
      ADD_ATTR: ["url", "data-theme", "align", "class", "style"],
      ALLOWED_URI_REGEXP: ALLOWED_URI_REGEX,
    });

    // Insert into database
    const result = await db
      .prepare("INSERT INTO tweets (embed_html) VALUES (?)")
      .bind(sanitizedHtml)
      .run();

    return new Response(
      JSON.stringify({
        id: result.meta?.last_row_id,
        embed_html: sanitizedHtml,
        success: true,
      }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error adding tweet:", error);
    return new Response(JSON.stringify({ error: "Failed to add tweet" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const GET: APIRoute = async ({ locals }) => {
  try {
    const db = locals.env.DB;

    if (!db) {
      return new Response(JSON.stringify({ error: "Database not available" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = await db
      .prepare("SELECT * FROM tweets ORDER BY created_at DESC")
      .all();

    return new Response(JSON.stringify(result.results || []), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching tweets:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch tweets" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
