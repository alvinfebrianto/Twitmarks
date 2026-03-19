import { defineMiddleware } from "astro:middleware";

function buildCsp(): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "connect-src 'self'",
    "script-src 'self' 'unsafe-inline' https://platform.twitter.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "frame-src https://platform.twitter.com https://syndication.twitter.com",
    "media-src 'self' https://video.twimg.com https://pbs.twimg.com",
  ].join("; ");
}

export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();
  const contentType = response.headers.get("Content-Type") ?? "";

  if (contentType.includes("text/html")) {
    response.headers.set("Content-Security-Policy", buildCsp());
  }

  return response;
});
