import { defineMiddleware } from "astro:middleware";
import { applySecurityHeaders } from "./lib/security-headers";

export const onRequest = defineMiddleware(async (_context, next) =>
  applySecurityHeaders(await next())
);
