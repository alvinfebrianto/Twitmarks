import type { APIRoute } from "astro";
import { createWorkersLogger } from "evlog/workers";
import {
  buildClearCookie,
  revokeAdminSession,
} from "../../../lib/admin-session";
import { getDbOrThrow } from "../../../lib/db";
import { ensureEvlogError, errorToObject } from "../../../lib/evlog";
import { ensureDatabaseSchema } from "../../../lib/tweets-schema";

export const prerender = false;

function buildResponseHeaders() {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Set-Cookie": buildClearCookie(),
  };
}

function errorResponse(error: { status: number }) {
  return new Response(JSON.stringify(errorToObject(error as never)), {
    status: error.status,
    headers: buildResponseHeaders(),
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const log = createWorkersLogger(request);

  try {
    log.set({ api: { route: "POST /api/admin/logout" } });

    const db = getDbOrThrow(locals);
    await ensureDatabaseSchema(db);
    await revokeAdminSession(request, db);
    log.emit({ status: 200 });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: buildResponseHeaders(),
    });
  } catch (error) {
    const evlogError = ensureEvlogError(error, "Failed to clear admin session");
    log.error(evlogError);
    log.emit({ status: evlogError.status });
    return errorResponse(evlogError);
  }
};
