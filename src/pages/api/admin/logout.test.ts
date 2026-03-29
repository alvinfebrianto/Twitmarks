import { describe, expect, it } from "vitest";
import { createLocals, createMockDB } from "../../../test/mock-db";
import { POST as createTweet } from "../tweets";
import { POST as login } from "./login";
import { POST as logout } from "./logout";

function createLoginRequest(secret = "test-secret") {
  return new Request("http://localhost/api/admin/login", {
    method: "POST",
    headers: {
      "CF-Connecting-IP": "203.0.113.10",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ secret }),
  });
}

describe("POST /api/admin/logout", () => {
  it("clears the cookie and invalidates the current session", async () => {
    const db = createMockDB();
    const locals = createLocals({ db });

    const loginResponse = await login({
      request: createLoginRequest(),
      locals,
    } as never);
    const cookie = loginResponse.headers.get("Set-Cookie");

    expect(cookie).toBeTruthy();

    const logoutResponse = await logout({
      request: new Request("http://localhost/api/admin/logout", {
        method: "POST",
        headers: { Cookie: cookie as string },
      }),
      locals,
    } as never);

    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.headers.get("Set-Cookie")).toContain("Max-Age=0");

    const tweetResponse = await createTweet({
      request: new Request("http://localhost/api/tweets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie as string,
        },
        body: JSON.stringify({
          embed_html: "https://x.com/user/status/1234567890",
        }),
      }),
      locals,
    } as never);

    expect(tweetResponse.status).toBe(401);
  });

  it("returns a JSON error and clears cookie when logout fails", async () => {
    const locals = createLocals({ db: 0 });

    const response = await logout({
      request: new Request("http://localhost/api/admin/logout", {
        method: "POST",
        headers: { Cookie: "__Host-twitmarks-admin=stale" },
      }),
      locals,
    } as never);

    expect(response.status).toBe(500);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
      status: 500,
    });
  });
});
