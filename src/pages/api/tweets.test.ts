import { describe, expect, it, vi } from "vitest";
import {
  ADMIN_SESSION_COOKIE,
  createSessionValue,
} from "../../lib/admin-session";
import { DELETE, GET, PATCH, POST } from "./tweets";

function createMockDB(
  results: unknown[] = [],
  overrides: {
    changes?: number;
    firstResult?: unknown;
    firstResults?: unknown[];
  } = {}
) {
  const firstResults = overrides.firstResults ?? [];
  let firstCallIndex = 0;
  const firstFn =
    firstResults.length > 0
      ? vi.fn().mockImplementation(() => {
          const result = firstResults[firstCallIndex] ?? null;
          firstCallIndex++;
          return Promise.resolve(result);
        })
      : vi.fn().mockResolvedValue(overrides.firstResult ?? null);

  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({
          meta: { last_row_id: 1, changes: overrides.changes ?? 1 },
        }),
        all: vi.fn().mockResolvedValue({ results }),
        first: firstFn,
      }),
      all: vi.fn().mockResolvedValue({ results }),
      first: firstFn,
    }),
    batch: vi.fn().mockResolvedValue([]),
  };
}

function createLocals(overrides: { db?: unknown; adminSecret?: string } = {}) {
  return {
    runtime: {
      env: {
        DB: overrides.db ?? createMockDB(),
        ADMIN_SECRET: overrides.adminSecret ?? "test-secret",
        ASSETS: {},
      },
    },
  } as unknown as App.Locals;
}

async function createAdminCookie(secret = "test-secret") {
  const value = await createSessionValue(secret);
  return `${ADMIN_SESSION_COOKIE}=${value}`;
}

async function createRequest(
  body: Record<string, unknown>,
  secret = "test-secret"
) {
  return new Request("http://localhost/api/tweets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: await createAdminCookie(secret),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/tweets", () => {
  it("inserts a tweet and returns 201", async () => {
    const db = createMockDB();
    const locals = createLocals({ db });
    const request = await createRequest({
      embed_html: '<blockquote class="twitter-tweet"><p>hello</p></blockquote>',
    });

    const response = await POST({
      request,
      locals,
    } as never);

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.id).toBe(1);
    expect(json.created_at).toBeDefined();
    expect(db.prepare).toHaveBeenCalledWith(
      "INSERT INTO tweets (embed_html, search_text, sort_order) VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tweets))"
    );
  });

  it("returns 401 when no session cookie is provided", async () => {
    const locals = createLocals();
    const request = new Request("http://localhost/api/tweets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embed_html: "<blockquote>test</blockquote>" }),
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
      body: JSON.stringify({ embed_html: "<blockquote>test</blockquote>" }),
    });

    const response = await POST({ request, locals } as never);

    expect(response.status).toBe(401);
  });

  it("returns 400 when Content-Type is missing", async () => {
    const locals = createLocals();
    const cookie = await createAdminCookie();
    const request = new Request("http://localhost/api/tweets", {
      method: "POST",
      headers: { Cookie: cookie },
      body: JSON.stringify({ embed_html: "<blockquote>test</blockquote>" }),
    });

    const response = await POST({ request, locals } as never);

    expect(response.status).toBe(400);
  });

  it("returns 400 when request body is not valid JSON", async () => {
    const locals = createLocals();
    const cookie = await createAdminCookie();
    const request = new Request("http://localhost/api/tweets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: "not json",
    });

    const response = await POST({ request, locals } as never);

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.why).toContain("valid JSON");
  });

  it("returns 400 when embed_html is missing", async () => {
    const locals = createLocals();
    const request = await createRequest({});

    const response = await POST({ request, locals } as never);

    expect(response.status).toBe(400);
  });

  it("preserves twitter embed attributes after sanitization", async () => {
    const db = createMockDB();
    const locals = createLocals({ db });
    const embedHtml =
      '<blockquote class="twitter-tweet" data-lang="en" data-dnt="true" data-theme="dark">' +
      '<p lang="en" dir="ltr">hello</p>' +
      '&mdash; ian (@shaoruu) <a href="https://twitter.com/shaoruu/status/123">Feb 20</a>' +
      "</blockquote>" +
      ' <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>';
    const request = await createRequest({ embed_html: embedHtml });

    const response = await POST({ request, locals } as never);

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.embed_html).toContain("twitter-tweet");
    expect(json.embed_html).toContain('data-theme="dark"');
    expect(json.embed_html).toContain('data-dnt="true"');
    expect(json.embed_html).toContain('data-lang="en"');
    expect(json.embed_html).toContain("https://twitter.com/shaoruu/status/123");
    expect(json.embed_html).not.toContain("<script");
  });

  it("preserves t.co links in tweet embeds", async () => {
    const db = createMockDB();
    const locals = createLocals({ db });
    const request = await createRequest({
      embed_html:
        '<blockquote class="twitter-tweet"><a href="https://t.co/abc123">pic.twitter.com/abc123</a></blockquote>',
    });

    const response = await POST({ request, locals } as never);

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.embed_html).toContain("https://t.co/abc123");
  });

  it("returns 400 when sanitized embed_html becomes empty", async () => {
    const db = createMockDB();
    const locals = createLocals({ db });
    const request = await createRequest({
      embed_html: '<script>alert("xss")</script>',
    });

    const response = await POST({ request, locals } as never);

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.why).toContain(
      "embed_html contained no allowed content after sanitization"
    );
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("accepts a bare tweet URL and fetches search_text from syndication", async () => {
    const originalFetch = globalThis.fetch;
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
    const request = await createRequest({
      embed_html: "https://x.com/brfootball/status/2035915492200677484",
    });

    const response = await POST({ request, locals } as never);

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.search_text).toBe("Hello from Twitter Test @test");
    expect(json.embed_html).toBe(
      "https://x.com/brfootball/status/2035915492200677484"
    );

    globalThis.fetch = originalFetch;
  });

  it("accepts bare tweet URLs with query params and canonicalizes them", async () => {
    const originalFetch = globalThis.fetch;
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
    const request = await createRequest({
      embed_html:
        "https://x.com/brfootball/status/2035915492200677484?s=20&t=abc123",
    });

    const response = await POST({ request, locals } as never);

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.search_text).toBe("Hello from Twitter Test @test");
    expect(json.embed_html).toBe(
      "https://x.com/brfootball/status/2035915492200677484"
    );

    globalThis.fetch = originalFetch;
  });

  it("accepts a bare tweet URL even when syndication fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network error"))
    );

    const db = createMockDB();
    const locals = createLocals({ db });
    const request = await createRequest({
      embed_html: "https://x.com/user/status/123456",
    });

    const response = await POST({ request, locals } as never);

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.search_text).toBeNull();

    vi.restoreAllMocks();
  });

  it("returns generic 500 when ADMIN_SECRET is not configured", async () => {
    const db = createMockDB();
    const locals = {
      runtime: {
        env: {
          DB: db,
          ADMIN_SECRET: undefined,
          ASSETS: {},
        },
      },
    } as unknown as App.Locals;
    const request = new Request("http://localhost/api/tweets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${ADMIN_SESSION_COOKIE}=some-value`,
      },
      body: JSON.stringify({ embed_html: "<blockquote>test</blockquote>" }),
    });

    const response = await POST({ request, locals } as never);

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).not.toContain("ADMIN_SECRET");
  });
});

function createGetRequest() {
  return new Request("http://localhost/api/tweets");
}

describe("GET /api/tweets", () => {
  it("returns tweets from the database", async () => {
    const tweets = [
      { id: 1, embed_html: "<blockquote>tweet1</blockquote>" },
      { id: 2, embed_html: "<blockquote>tweet2</blockquote>" },
    ];
    const db = createMockDB(tweets);
    const locals = createLocals({ db });

    const response = await GET({
      request: createGetRequest(),
      locals,
    } as never);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual(tweets);
  });

  it("queries with sort_order ordering", async () => {
    const db = createMockDB([]);
    const locals = createLocals({ db });

    await GET({ request: createGetRequest(), locals } as never);

    expect(db.prepare).toHaveBeenCalledWith(
      "SELECT id, embed_html, search_text, sort_order, strftime('%Y-%m-%dT%H:%M:%fZ', created_at) AS created_at FROM tweets ORDER BY sort_order ASC, id ASC"
    );
  });

  it("includes Cache-Control header", async () => {
    const db = createMockDB([]);
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
    const db = createMockDB([], { changes: 1 });
    const locals = createLocals({ db });
    const cookie = await createAdminCookie();
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
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.id).toBe(1);
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
    const locals = createLocals();
    const cookie = await createAdminCookie();
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
    const db = createMockDB([], { changes: 0 });
    const locals = createLocals({ db });
    const cookie = await createAdminCookie();
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
    const db = createMockDB([], {
      firstResults: [{ sort_order: 1 }, { sort_order: 2 }],
    });
    const locals = createLocals({ db });
    const cookie = await createAdminCookie();
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
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(db.batch.mock.calls[0][0]).toHaveLength(2);

    const bind = db.prepare.mock.results[0]?.value.bind;
    const updateBindCalls = bind.mock.calls.filter(
      (args: unknown[]) => args.length === 2
    );
    expect(updateBindCalls).toEqual([
      [2, 1],
      [1, 2],
    ]);
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
    const locals = createLocals();
    const cookie = await createAdminCookie();
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

  it("returns 400 when movedId or targetId is not an integer", async () => {
    const locals = createLocals();
    const cookie = await createAdminCookie();
    const request = new Request("http://localhost/api/tweets", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ movedId: 1.5, targetId: 2 }),
    });

    const response = await PATCH({ request, locals } as never);

    expect(response.status).toBe(400);
  });

  it("returns 400 when movedId and targetId are the same", async () => {
    const locals = createLocals();
    const cookie = await createAdminCookie();
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
    const db = createMockDB([], {
      firstResults: [{ sort_order: 1 }, null],
    });
    const locals = createLocals({ db });
    const cookie = await createAdminCookie();
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
