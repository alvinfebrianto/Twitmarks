import type { APIRoute } from "astro";
import { createWorkersLogger } from "evlog/workers";
import {
  ADMIN_SECRET_MAX_LENGTH,
  requireAdminSession,
  updateAdminSecret,
} from "../../../lib/admin-session";
import { getDbOrThrow } from "../../../lib/db";
import { ensureEvlogError, errors, errorToObject } from "../../../lib/evlog";
import { readJsonObject } from "../../../lib/request-body";
import {
  ensureAdminSecretSchema,
  ensureAdminSessionsSchema,
} from "../../../lib/tweets-schema";

export const prerender = false;
const MAX_SECRET_BODY_BYTES = 1024;

function errorResponse(error: { status: number }) {
  return new Response(JSON.stringify(errorToObject(error as never)), {
    status: error.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const log = createWorkersLogger(request);

  try {
    log.set({ api: { route: "POST /api/admin/secret" } });

    const db = getDbOrThrow(locals);
    await ensureAdminSessionsSchema(db);
    await ensureAdminSecretSchema(db);
    await requireAdminSession(request, db);

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

    const body = await readJsonObject(request, MAX_SECRET_BODY_BYTES);
    const { secret } = body;

    if (typeof secret !== "string" || !secret.trim()) {
      throw errors.badRequest(
        "secret",
        "secret is required and must be a string"
      );
    }

    if (secret.trim().length > ADMIN_SECRET_MAX_LENGTH) {
      throw errors.badRequest(
        "secret",
        `secret must be ${ADMIN_SECRET_MAX_LENGTH} characters or fewer`
      );
    }

    await updateAdminSecret(db, secret.trim());
    log.emit({ status: 200 });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const evlogError = ensureEvlogError(error, "Failed to update admin secret");
    log.error(evlogError);
    log.emit({ status: evlogError.status });
    return errorResponse(evlogError);
  }
};
