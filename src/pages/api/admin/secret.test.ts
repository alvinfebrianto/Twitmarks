import { describe, expect, it } from "vitest";
import { createLocals, createMockDB } from "../../../test/mock-db";
import { POST as login } from "./login";
import { POST as updateSecret } from "./secret";

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

function createSecretUpdateRequest(secret: string, cookie: string) {
  return new Request("http://localhost/api/admin/secret", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({ secret }),
  });
}

describe("POST /api/admin/secret", () => {
  it("rotates the admin secret at runtime for subsequent logins", async () => {
    const db = createMockDB();
    const locals = createLocals({ db });

    const initialLogin = await login({
      request: createLoginRequest("test-secret"),
      locals,
    } as never);
    const cookie = initialLogin.headers.get("Set-Cookie");

    expect(initialLogin.status).toBe(200);
    expect(cookie).toBeTruthy();

    const updateResponse = await updateSecret({
      request: createSecretUpdateRequest("new-secret", cookie as string),
      locals,
    } as never);

    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toEqual({ success: true });

    const newLogin = await login({
      request: createLoginRequest("new-secret"),
      locals,
    } as never);
    const oldLogin = await login({
      request: createLoginRequest("test-secret"),
      locals,
    } as never);

    expect(newLogin.status).toBe(200);
    expect(oldLogin.status).toBe(401);
  });
});
