import { describe, expect, it, vi } from "vitest";
import { GET, POST } from "./tweets";

function createMockDB(results: unknown[] = []) {
  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({
          meta: { last_row_id: 1 },
        }),
      }),
      all: vi.fn().mockResolvedValue({ results }),
    }),
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

function createRequest(body: Record<string, unknown>, secret = "test-secret") {
  return new Request("http://localhost/api/tweets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/tweets", () => {
  it("inserts a tweet and returns 201", async () => {
    const db = createMockDB();
    const locals = createLocals({ db });
    const request = createRequest({
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
    expect(db.prepare).toHaveBeenCalledWith(
      "INSERT INTO tweets (embed_html) VALUES (?)"
    );
  });

  it("returns 401 when no auth header is provided", async () => {
    const locals = createLocals();
    const request = new Request("http://localhost/api/tweets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embed_html: "<blockquote>test</blockquote>" }),
    });

    const response = await POST({ request, locals } as never);

    expect(response.status).toBe(401);
  });

  it("returns 401 when token is invalid", async () => {
    const locals = createLocals();
    const request = createRequest(
      { embed_html: "<blockquote>test</blockquote>" },
      "wrong-secret"
    );

    const response = await POST({ request, locals } as never);

    expect(response.status).toBe(401);
  });

  it("returns 400 when embed_html is missing", async () => {
    const locals = createLocals();
    const request = createRequest({});

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
    const request = createRequest({ embed_html: embedHtml });

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
    const request = createRequest({
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
    const request = createRequest({
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
});

describe("GET /api/tweets", () => {
  it("returns tweets from the database", async () => {
    const tweets = [
      { id: 1, embed_html: "<blockquote>tweet1</blockquote>" },
      { id: 2, embed_html: "<blockquote>tweet2</blockquote>" },
    ];
    const db = createMockDB(tweets);
    const locals = createLocals({ db });

    const response = await GET({ locals } as never);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual(tweets);
  });
});
