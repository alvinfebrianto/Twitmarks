import type { APIRoute } from "astro";
import { createWorkersLogger } from "evlog/workers";
import { buildClearCookie } from "../../../lib/admin-session";

export const prerender = false;

export const POST: APIRoute = ({ request }) => {
  const log = createWorkersLogger(request);
  log.set({ api: { route: "POST /api/admin/logout" } });
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
