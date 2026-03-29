import { describe, expect, it } from "vitest";
import { createLocals, createMockDB } from "../../../test/mock-db";
import { POST } from "./login";

function createRequest(
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
) {
  return new Request("http://localhost/api/admin/login", {
    method: "POST",
    headers: {
      "CF-Connecting-IP": "203.0.113.10",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/login", () => {
  it("creates an opaque admin session cookie on successful login", async () => {
    const db = createMockDB();
    const locals = createLocals({ db });

    const response = await POST({
      request: createRequest({ secret: "test-secret" }),
      locals,
    } as never);

    expect(response.status).toBe(200);
    const setCookie = response.headers.get("Set-Cookie");
    expect(setCookie).toContain("__Host-twitmarks-admin=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Max-Age=");
    expect(setCookie).not.toContain("test-secret");
  });

  it("bootstraps missing schema tables before rate limiting and session creation", async () => {
    const db = createMockDB({
      missingTables: ["admin_sessions", "rate_limits"],
    });
    const locals = createLocals({ db });

    const response = await POST({
      request: createRequest({ secret: "test-secret" }),
      locals,
    } as never);

    expect(response.status).toBe(200);
    expect(db.prepare).toHaveBeenCalledWith(
      expect.stringContaining("CREATE TABLE IF NOT EXISTS admin_sessions")
    );
    expect(db.prepare).toHaveBeenCalledWith(
      expect.stringContaining("CREATE TABLE IF NOT EXISTS rate_limits")
    );
  });

  it("issues a different session cookie for each successful login", async () => {
    const db = createMockDB();
    const locals = createLocals({ db });

    const first = await POST({
      request: createRequest({ secret: "test-secret" }),
      locals,
    } as never);
    const second = await POST({
      request: createRequest({ secret: "test-secret" }),
      locals,
    } as never);

    expect(first.headers.get("Set-Cookie")).not.toBe(
      second.headers.get("Set-Cookie")
    );
  });

  it("rate limits repeated login attempts from the same IP", async () => {
    const db = createMockDB();
    const locals = createLocals({ db });

    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await POST({
        request: createRequest({ secret: "wrong-secret" }),
        locals,
      } as never);

      expect(response.status).toBe(401);
    }

    const limited = await POST({
      request: createRequest({ secret: "wrong-secret" }),
      locals,
    } as never);

    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
  });

  it("rejects secrets longer than 256 characters", async () => {
    const locals = createLocals();

    const response = await POST({
      request: createRequest({ secret: "a".repeat(257) }),
      locals,
    } as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      why: expect.stringContaining("256"),
    });
  });

  it("rejects oversized JSON bodies before processing login", async () => {
    const locals = createLocals();

    const response = await POST({
      request: createRequest({
        padding: "x".repeat(5000),
        secret: "test-secret",
      }),
      locals,
    } as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      why: expect.stringContaining("too large"),
    });
  });
});
