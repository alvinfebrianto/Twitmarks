function appendVary(headers: Headers, value: string) {
  const existing = headers.get("Vary");

  if (!existing) {
    headers.set("Vary", value);
    return;
  }

  const parts = existing
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.includes(value)) {
    headers.set("Vary", [...parts, value].join(", "));
  }
}

export function buildCsp(): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "connect-src 'self'",
    // Astro injects inline island bootstrap scripts required for hydration.
    "script-src 'self' 'unsafe-inline' https://platform.twitter.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "frame-src https://platform.twitter.com https://syndication.twitter.com",
    "media-src 'self' https://pbs.twimg.com",
  ].join("; ");
}

export function applySecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  const contentType = headers.get("Content-Type") ?? "";

  headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload"
  );
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  if (contentType.includes("text/html")) {
    headers.set("Content-Security-Policy", buildCsp());
    headers.set("Cache-Control", "private, no-store");
    appendVary(headers, "Cookie");
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}
