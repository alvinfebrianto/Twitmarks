import type { APIRoute } from "astro";
import { createWorkersLogger } from "evlog/workers";
import {
  buildClearCookie,
  revokeAdminSession,
} from "../../../lib/admin-session";
import { getDbOrThrow } from "../../../lib/db";
import { ensureDatabaseSchema } from "../../../lib/tweets-schema";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const log = createWorkersLogger(request);
  log.set({ api: { route: "POST /api/admin/logout" } });

  const db = getDbOrThrow(locals);
  await ensureDatabaseSchema(db);
  await revokeAdminSession(request, db);
  log.emit({ status: 200 });

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Set-Cookie": buildClearCookie(),
    },
  });
};
