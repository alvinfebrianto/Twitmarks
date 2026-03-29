import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  createAdminSession,
} from "../../lib/admin-session";
import type { Database } from "../../lib/db";
import { createLocals, createMockDB } from "../../test/mock-db";
import { DELETE, GET, PATCH, POST } from "./tweets";

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function createAdminCookie(db: Database) {
  return `${ADMIN_SESSION_COOKIE}=${await createAdminSession(db)}`;
}

async function createPostRequest(body: Record<string, unknown>, db: Database) {
  return new Request("http://localhost/api/tweets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: await createAdminCookie(db),
    },
    body: JSON.stringify(body),
  });
}

function createGetRequest() {
  return new Request("http://localhost/api/tweets");
}

describe("POST /api/tweets", () => {
  it("stores a canonical tweet URL and returns 201", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: () =>
          Promise.resolve({
            text: "Hello from Twitter",
            user: { name: "Test", screen_name: "test" },
          }),
      })
    );

    const db = createMockDB();
    const locals = createLocals({ db });
    const request = await createPostRequest(
      {
        embed_html: "https://x.com/brfootball/status/2035915492200677484?s=20",
      },
      db as never
    );

    const response = await POST({ request, locals } as never);

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.id).toBe(1);
    expect(json.embed_html).toBe(
      "https://x.com/brfootball/status/2035915492200677484"
    );
    expect(json.search_text).toBe("Hello from Twitter Test @test");
    expect(db.prepare).toHaveBeenCalledWith(
      "INSERT INTO tweets (embed_html, search_text, sort_order) VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tweets))"
    );
  });

  it("returns 401 when no session cookie is provided", async () => {
    const locals = createLocals();
    const request = new Request("http://localhost/api/tweets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embed_html: "https://x.com/user/status/123" }),
    });

    const response = await POST({ request, locals } as never);

    expect(response.status).toBe(401);
  });

  it("returns 401 when session cookie is invalid", async () => {
    const locals = createLocals();
    const request = new Request("http://localhost/api/tweets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${ADMIN_SESSION_COOKIE}=invalid-value`,
      },
      body: JSON.stringify({ embed_html: "https://x.com/user/status/123" }),
    });

    const response = await POST({ request, locals } as never);

    expect(response.status).toBe(401);
  });

  it("returns 401 when the admin session has expired", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-27T00:00:00.000Z"));

    const db = createMockDB();
    const locals = createLocals({ db });
    const cookie = await createAdminCookie(db as never);

    vi.setSystemTime(
      new Date(Date.now() + (ADMIN_SESSION_TTL_SECONDS + 1) * 1000)
    );

    const request = new Request("http://localhost/api/tweets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ embed_html: "https://x.com/user/status/123" }),
    });

    const response = await POST({ request, locals } as never);

    expect(response.status).toBe(401);
  });

  it("returns 400 when Content-Type is missing", async () => {
    const db = createMockDB();
    const locals = createLocals({ db });
    const request = new Request("http://localhost/api/tweets", {
      method: "POST",
      headers: { Cookie: await createAdminCookie(db as never) },
      body: JSON.stringify({ embed_html: "https://x.com/user/status/123" }),
    });

    const response = await POST({ request, locals } as never);

    expect(response.status).toBe(400);
  });

  it("returns 400 when request body is not valid JSON", async () => {
    const db = createMockDB();
    const locals = createLocals({ db });
    const request = new Request("http://localhost/api/tweets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: await createAdminCookie(db as never),
      },
      body: "not json",
    });

    const response = await POST({ request, locals } as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      why: expect.stringContaining("valid JSON"),
    });
  });

  it("returns 400 when embed_html is missing", async () => {
    const db = createMockDB();
    const locals = createLocals({ db });
    const request = await createPostRequest({}, db as never);

    const response = await POST({ request, locals } as never);

    expect(response.status).toBe(400);
  });

  it("returns 400 when embed_html is not a bare tweet URL", async () => {
    const db = createMockDB();
    const locals = createLocals({ db });
    const request = await createPostRequest(
      {
        embed_html:
          '<blockquote class="twitter-tweet"><p>hello</p></blockquote>',
      },
      db as never
    );

    const response = await POST({ request, locals } as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      why: expect.stringContaining("tweet URL"),
    });
  });

  it("returns 400 when tweet URL exceeds the field limit", async () => {
    const db = createMockDB();
    const locals = createLocals({ db });
    const request = await createPostRequest(
      { embed_html: `https://x.com/user/status/${"1".repeat(2050)}` },
      db as never
    );

    const response = await POST({ request, locals } as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      why: expect.stringContaining("2048"),
    });
  });

  it("rejects oversized JSON bodies before processing tweet input", async () => {
    const db = createMockDB();
    const locals = createLocals({ db });
    const request = await createPostRequest(
      {
        embed_html: "https://x.com/user/status/123456",
        padding: "x".repeat(15_000),
      },
      db as never
    );

    const response = await POST({ request, locals } as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      why: expect.stringContaining("too large"),
    });
  });

  it("accepts a bare tweet URL even when syndication fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network error"))
    );

    const db = createMockDB();
    const locals = createLocals({ db });
    const request = await createPostRequest(
      { embed_html: "https://x.com/user/status/123456" },
      db as never
    );

    const response = await POST({ request, locals } as never);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      embed_html: "https://x.com/user/status/123456",
      search_text: null,
    });
  });
});

describe("GET /api/tweets", () => {
  it("returns tweets from the database", async () => {
    const tweets = [
      { id: 1, embed_html: "https://x.com/user/status/1" },
      { id: 2, embed_html: "https://x.com/user/status/2" },
    ];
    const db = createMockDB({ results: tweets });
    const locals = createLocals({ db });

    const response = await GET({
      request: createGetRequest(),
      locals,
    } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(tweets);
  });

  it("migrates legacy databases missing search_text before selecting", async () => {
    const tweets = [
      {
        id: 1,
        embed_html: "https://x.com/user/status/123",
        search_text: "hello world",
        sort_order: 1,
        created_at: "2026-03-26T00:00:00.000Z",
      },
    ];

    const db = createMockDB({ results: tweets });
    db.state.setHasSearchTextColumn(false);
    const locals = createLocals({ db });

    const response = await GET({
      request: createGetRequest(),
      locals,
    } as never);

    expect(response.status).toBe(200);
    expect(db.prepare).toHaveBeenCalledWith("PRAGMA table_info(tweets)");
    expect(db.prepare).toHaveBeenCalledWith(
      "ALTER TABLE tweets ADD COLUMN search_text TEXT"
    );
    expect(await response.json()).toEqual(tweets);
  });

  it("queries with sort_order ordering", async () => {
    const db = createMockDB();
    const locals = createLocals({ db });

    await GET({ request: createGetRequest(), locals } as never);

    expect(db.prepare).toHaveBeenCalledWith(
      "SELECT id, embed_html, search_text, sort_order, strftime('%Y-%m-%dT%H:%M:%fZ', created_at) AS created_at FROM tweets ORDER BY sort_order ASC, id ASC"
    );
  });

  it("includes Cache-Control header", async () => {
    const db = createMockDB();
    const locals = createLocals({ db });

    const response = await GET({
      request: createGetRequest(),
      locals,
    } as never);

    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=60, max-age=0, must-revalidate"
    );
  });
});

describe("DELETE /api/tweets", () => {
  it("deletes an existing tweet and returns 200", async () => {
    const db = createMockDB({ changes: 1 });
    const locals = createLocals({ db });
    const cookie = await createAdminCookie(db as never);
    const request = new Request("http://localhost/api/tweets", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ id: 1 }),
    });

    const response = await DELETE({ request, locals } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      id: 1,
    });
  });

  it("returns 401 when session is missing", async () => {
    const locals = createLocals();
    const request = new Request("http://localhost/api/tweets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: 1 }),
    });

    const response = await DELETE({ request, locals } as never);

    expect(response.status).toBe(401);
  });

  it("returns 400 when id is missing", async () => {
    const db = createMockDB();
    const locals = createLocals({ db });
    const cookie = await createAdminCookie(db as never);
    const request = new Request("http://localhost/api/tweets", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({}),
    });

    const response = await DELETE({ request, locals } as never);

    expect(response.status).toBe(400);
  });

  it("returns 404 when tweet does not exist", async () => {
    const db = createMockDB({ changes: 0 });
    const locals = createLocals({ db });
    const cookie = await createAdminCookie(db as never);
    const request = new Request("http://localhost/api/tweets", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ id: 999 }),
    });

    const response = await DELETE({ request, locals } as never);

    expect(response.status).toBe(404);
  });
});

describe("PATCH /api/tweets", () => {
  it("swaps two tweets and returns 200", async () => {
    const db = createMockDB({
      firstResults: [{ sort_order: 1 }, { sort_order: 2 }],
    });
    const locals = createLocals({ db });
    const cookie = await createAdminCookie(db as never);
    const request = new Request("http://localhost/api/tweets", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ movedId: 1, targetId: 2 }),
    });

    const response = await PATCH({ request, locals } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true });
    expect(db.batch).toHaveBeenCalledTimes(1);
  });

  it("returns 401 when session is missing", async () => {
    const locals = createLocals();
    const request = new Request("http://localhost/api/tweets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ movedId: 1, targetId: 2 }),
    });

    const response = await PATCH({ request, locals } as never);

    expect(response.status).toBe(401);
  });

  it("returns 400 when movedId or targetId is missing", async () => {
    const db = createMockDB();
    const locals = createLocals({ db });
    const cookie = await createAdminCookie(db as never);
    const request = new Request("http://localhost/api/tweets", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({}),
    });

    const response = await PATCH({ request, locals } as never);

    expect(response.status).toBe(400);
  });

  it("returns 400 when movedId and targetId are the same", async () => {
    const db = createMockDB();
    const locals = createLocals({ db });
    const cookie = await createAdminCookie(db as never);
    const request = new Request("http://localhost/api/tweets", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ movedId: 1, targetId: 1 }),
    });

    const response = await PATCH({ request, locals } as never);

    expect(response.status).toBe(400);
  });

  it("returns 404 when one of the IDs does not exist", async () => {
    const db = createMockDB({
      firstResults: [{ sort_order: 1 }, null],
    });
    const locals = createLocals({ db });
    const cookie = await createAdminCookie(db as never);
    const request = new Request("http://localhost/api/tweets", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ movedId: 1, targetId: 999 }),
    });

    const response = await PATCH({ request, locals } as never);

    expect(response.status).toBe(404);
  });
});
