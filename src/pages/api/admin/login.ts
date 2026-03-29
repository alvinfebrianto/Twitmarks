import type { APIRoute } from "astro";
import { createWorkersLogger } from "evlog/workers";
import {
  buildSetCookie,
  createAdminSession,
  verifyAdminSecret,
} from "../../../lib/admin-session";
import { getDbOrThrow } from "../../../lib/db";
import { ensureEvlogError, errors, errorToObject } from "../../../lib/evlog";
import { enforceRateLimit } from "../../../lib/rate-limit";
import { readJsonObject } from "../../../lib/request-body";
import { ensureDatabaseSchema } from "../../../lib/tweets-schema";

export const prerender = false;
const MAX_LOGIN_BODY_BYTES = 1024;

function errorResponse(error: { retryAfter?: number; status: number }) {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });

  if (typeof error.retryAfter === "number") {
    headers.set("Retry-After", String(error.retryAfter));
  }

  return new Response(JSON.stringify(errorToObject(error as never)), {
    status: error.status,
    headers,
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const log = createWorkersLogger(request);

  try {
    log.set({ api: { route: "POST /api/admin/login" } });

    const db = getDbOrThrow(locals);
    await ensureDatabaseSchema(db);
    await enforceRateLimit(db, request, {
      limit: 5,
      scope: "admin-login",
      windowSeconds: 60,
    });

    const contentType = request.headers.get("Content-Type") ?? "";
    if (
      !contentType
        .split(";")[0]
        ?.trim()
        .toLowerCase()
        .includes("application/json")
    ) {
      throw errors.badRequest(
        "Content-Type",
        "Content-Type must be application/json"
      );
    }

    const body = await readJsonObject(request, MAX_LOGIN_BODY_BYTES);

    const { secret } = body;
    if (typeof secret !== "string" || !secret.trim()) {
      throw errors.badRequest(
        "secret",
        "secret is required and must be a string"
      );
    }

    if (secret.trim().length > 256) {
      throw errors.badRequest(
        "secret",
        "secret must be 256 characters or fewer"
      );
    }

    const configuredSecret = locals.runtime.env.ADMIN_SECRET;
    await verifyAdminSecret(secret.trim(), configuredSecret);

    const sessionValue = await createAdminSession(db);

    log.emit({ status: 200 });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Set-Cookie": buildSetCookie(sessionValue),
      },
    });
  } catch (error) {
    const evlogError = ensureEvlogError(
      error,
      "Failed to create admin session"
    );
    log.error(evlogError);
    log.emit({ status: evlogError.status });
    return errorResponse(evlogError);
  }
};
