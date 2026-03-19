import type { APIRoute } from "astro";
import { createWorkersLogger } from "evlog/workers";
import {
  buildSetCookie,
  createSessionValue,
  verifyAdminSecret,
} from "../../../lib/admin-session";
import { ensureEvlogError, errors, errorToObject } from "../../../lib/evlog";

export const prerender = false;

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
    log.set({ api: { route: "POST /api/admin/login" } });

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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw errors.badRequest("body", "Request body must be valid JSON");
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw errors.badRequest("body", "Request body must be a JSON object");
    }

    const { secret } = body as Record<string, unknown>;
    if (typeof secret !== "string" || !secret.trim()) {
      throw errors.badRequest(
        "secret",
        "secret is required and must be a string"
      );
    }

    const configuredSecret = locals.runtime.env.ADMIN_SECRET;
    await verifyAdminSecret(secret.trim(), configuredSecret);

    const sessionValue = await createSessionValue(configuredSecret as string);

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
