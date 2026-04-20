import { describe, expect, it } from "vitest";
import { applySecurityHeaders } from "./lib/security-headers";

describe("applySecurityHeaders", () => {
  it("adds strict security headers to HTML responses", () => {
    const response = applySecurityHeaders(
      new Response("<html></html>", {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      })
    );

    expect(response.headers.get("Content-Security-Policy")).toContain(
      "script-src 'self' 'unsafe-inline' https://platform.twitter.com"
    );
    expect(response.headers.get("Content-Security-Policy")).not.toContain(
      "https://video.twimg.com"
    );
    expect(response.headers.get("Strict-Transport-Security")).toContain(
      "max-age=63072000"
    );
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin"
    );
    expect(response.headers.get("Permissions-Policy")).toContain(
      "geolocation=()"
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toContain("Cookie");
  });

  it("keeps generic security headers on non-HTML responses without CSP", () => {
    const response = applySecurityHeaders(
      new Response("{}", {
        headers: { "Content-Type": "application/json" },
      })
    );

    expect(response.headers.get("Content-Security-Policy")).toBeNull();
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin"
    );
  });
});
