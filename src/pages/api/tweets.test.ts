import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  createAdminSession,
} from "../../lib/admin-session";
import type { Database } from "../../lib/db";
import { createLocals, createMockDB } from "../../test/mock-db";
import { DELETE, GET, PATCH, POST } from "./tweets";

const STORED_TWEET_DATA = {
  __typename: "Tweet",
  id_str: "2035915492200677484",
  lang: "en",
  created_at: "2026-03-26T00:00:00.000Z",
  display_text_range: [0, 18],
  text: "Hello from Twitter",
  entities: {
    hashtags: [],
    urls: [],
    user_mentions: [],
    symbols: [],
  },
  user: {
    id_str: "1",
    name: "Test",
    profile_image_url_https: "https://example.com/avatar.jpg",
    profile_image_shape: "Circle",
    screen_name: "test",
    verified: false,
    is_blue_verified: false,
  },
  edit_control: {
    edit_tweet_ids: ["2035915492200677484"],
    editable_until_msecs: "0",
    is_edit_eligible: false,
    edits_remaining: "0",
  },
  isEdited: false,
  isStaleEdit: false,
  favorite_count: 0,
  conversation_count: 0,
  news_action_type: "conversation",
} as const;

const STORED_TWEET_DATA_WITH_VIDEO = {
  ...STORED_TWEET_DATA,
  mediaDetails: [
    {
      media_url_https:
        "https://pbs.twimg.com/ext_tw_video_thumb/123/pu/img/poster.jpg",
      original_info: { width: 720, height: 900 },
      sizes: {
        large: { h: 900, resize: "fit", w: 720 },
        medium: { h: 900, resize: "fit", w: 720 },
        small: { h: 680, resize: "fit", w: 544 },
        thumb: { h: 150, resize: "crop", w: 150 },
      },
      type: "video",
      video_info: {
        aspect_ratio: [4, 5],
        duration_millis: 10_000,
        variants: [
          {
            bitrate: 632_000,
            content_type: "video/mp4",
            url: "https://video.twimg.com/ext_tw_video/123/pu/vid/avc1/320x400/tweet.mp4",
          },
        ],
      },
    },
  ],
} as const;

function getSignedProxyUrl(actual: string) {
  return new URL(actual, "http://localhost");
}

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

function createCacheStub(response: Response | null) {
  return {
    default: {
      delete: vi.fn().mockResolvedValue(true),
      match: vi.fn().mockResolvedValue(response),
      put: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe("POST /api/tweets", () => {
  it("stores a canonical tweet URL and returns 201", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.resolve(STORED_TWEET_DATA),
    });
    vi.stubGlobal("fetch", fetchMock);

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
    const json = (await response.json()) as {
      embed_html: string;
      id: number;
      search_text: string | null;
      success: boolean;
      tweet_data: unknown;
    };
    expect(json.success).toBe(true);
    expect(json.id).toBe(1);
    expect(json.embed_html).toBe(
      "https://x.com/brfootball/status/2035915492200677484"
    );
    expect(json.search_text).toBe("Hello from Twitter Test @test");
    expect(json.tweet_data).toMatchObject(STORED_TWEET_DATA);
    expect(db.prepare).toHaveBeenCalledWith(
      "INSERT INTO tweets (embed_html, search_text, tweet_json, sort_order) VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tweets))"
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("captures tweet snapshots when the upstream requires a user-agent", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation((_input, init?: RequestInit) => {
        const headers = new Headers(init?.headers);

        if (!headers.get("user-agent")) {
          return Promise.resolve({
            ok: false,
            status: 400,
            headers: new Headers({ "content-type": "application/json" }),
            json: () => Promise.resolve({ error: "missing user-agent" }),
          });
        }

        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: () => Promise.resolve(STORED_TWEET_DATA),
        });
      });
    vi.stubGlobal("fetch", fetchMock);

    const db = createMockDB();
    const locals = createLocals({ db });
    const request = await createPostRequest(
      { embed_html: "https://x.com/brfootball/status/2035915492200677484" },
      db as never
    );

    const response = await POST({ request, locals } as never);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      search_text: "Hello from Twitter Test @test",
      tweet_data: STORED_TWEET_DATA,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.anything(),
      })
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get("user-agent")).toContain("Twitmarks");
  });

  it("returns newly stored tweet video urls as signed proxy links", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T12:00:00.000Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve(STORED_TWEET_DATA_WITH_VIDEO),
      })
    );

    const db = createMockDB();
    const locals = createLocals({ db });
    const request = await createPostRequest(
      { embed_html: "https://x.com/brfootball/status/2035915492200677484" },
      db as never
    );

    const response = await POST({ request, locals } as never);

    expect(response.status).toBe(201);

    const json = (await response.json()) as {
      tweet_data: {
        mediaDetails?: Array<{
          video_info?: { variants?: Array<{ url: string }> };
        }>;
      };
    };

    const proxyUrl = getSignedProxyUrl(
      json.tweet_data.mediaDetails?.[0]?.video_info?.variants?.[0]?.url ?? ""
    );

    expect(proxyUrl.pathname).toBe("/api/tweet/media");
    expect(proxyUrl.searchParams.get("url")).toBe(
      "https://video.twimg.com/ext_tw_video/123/pu/vid/avc1/320x400/tweet.mp4"
    );
    expect(proxyUrl.searchParams.get("exp")).toBeTruthy();
    expect(proxyUrl.searchParams.get("sig")).toBeTruthy();
  });

  it("invalidates the cached list after inserting a tweet", async () => {
    const cache = createCacheStub(null);
    vi.stubGlobal("caches", cache);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve(STORED_TWEET_DATA),
      })
    );

    const db = createMockDB();
    const locals = createLocals({ db });
    const request = await createPostRequest(
      { embed_html: "https://x.com/brfootball/status/2035915492200677484" },
      db as never
    );

    const response = await POST({ request, locals } as never);

    expect(response.status).toBe(201);
    expect(cache.default.delete).toHaveBeenCalledTimes(1);
    const [cacheKey] = cache.default.delete.mock.calls[0] as [Request];
    expect(cacheKey.method).toBe("GET");
    expect(cacheKey.url).toBe("http://localhost/api/tweets");
  });

  it("repairs an existing degraded row when the same tweet URL is re-added", async () => {
    const cache = createCacheStub(null);
    vi.stubGlobal("caches", cache);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve(STORED_TWEET_DATA),
      })
    );

    const db = createMockDB({
      firstResults: [
        {
          id: 7,
          sort_order: 4,
          created_at: "2026-03-27T00:00:00.000Z",
        },
      ],
    });
    const locals = createLocals({ db });
    const request = await createPostRequest(
      {
        embed_html: "https://x.com/brfootball/status/2035915492200677484?s=20",
      },
      db as never
    );

    const response = await POST({ request, locals } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: 7,
      embed_html: "https://x.com/brfootball/status/2035915492200677484",
      search_text: "Hello from Twitter Test @test",
      tweet_data: STORED_TWEET_DATA,
      sort_order: 4,
      created_at: "2026-03-27T00:00:00.000Z",
      repaired: true,
      success: true,
    });
    expect(db.prepare).toHaveBeenCalledWith(
      "SELECT id, sort_order, strftime('%Y-%m-%dT%H:%M:%fZ', created_at) AS created_at FROM tweets WHERE embed_html = ? AND (tweet_json IS NULL OR trim(tweet_json) = '' OR search_text IS NULL OR trim(search_text) = '') ORDER BY id ASC LIMIT 1"
    );
    expect(db.prepare).toHaveBeenCalledWith(
      "UPDATE tweets SET search_text = ?, tweet_json = ? WHERE id = ?"
    );
    expect(db.prepare).not.toHaveBeenCalledWith(
      "INSERT INTO tweets (embed_html, search_text, tweet_json, sort_order) VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tweets))"
    );
    expect(cache.default.delete).toHaveBeenCalledTimes(1);
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

  it("returns 502 without inserting when snapshot capture fails", async () => {
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

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: "Internal server error",
      status: 502,
    });
    expect(db.prepare).not.toHaveBeenCalledWith(
      "INSERT INTO tweets (embed_html, search_text, tweet_json, sort_order) VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tweets))"
    );
  });
});

describe("GET /api/tweets", () => {
  it("returns a cached response without hitting D1 again", async () => {
    const cachedResponse = new Response(
      JSON.stringify([
        {
          id: 1,
          embed_html: "https://x.com/user/status/1",
          tweet_data: STORED_TWEET_DATA,
        },
      ]),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, s-maxage=60, max-age=0, must-revalidate",
        },
      }
    );

    vi.stubGlobal("caches", createCacheStub(cachedResponse));

    const db = createMockDB({
      results: [{ id: 999, embed_html: "https://x.com/user/status/999" }],
    });
    const locals = createLocals({ db });

    const response = await GET({
      request: createGetRequest(),
      locals,
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        id: 1,
        embed_html: "https://x.com/user/status/1",
        tweet_data: STORED_TWEET_DATA,
      },
    ]);
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("stores successful uncached responses in the Worker cache", async () => {
    const cache = createCacheStub(null);
    vi.stubGlobal("caches", cache);

    const tweets = [
      {
        id: 1,
        embed_html: "https://x.com/user/status/1",
        tweet_json: JSON.stringify(STORED_TWEET_DATA),
      },
    ];
    const db = createMockDB({ results: tweets });
    const locals = createLocals({ db });

    const response = await GET({
      request: createGetRequest(),
      locals,
    } as never);

    expect(response.status).toBe(200);
    expect(cache.default.match).toHaveBeenCalledTimes(1);
    expect(cache.default.put).toHaveBeenCalledTimes(1);
  });

  it("returns tweets from the database", async () => {
    const tweets = [
      {
        id: 1,
        embed_html: "https://x.com/user/status/1",
        tweet_json: JSON.stringify(STORED_TWEET_DATA),
      },
      { id: 2, embed_html: "https://x.com/user/status/2" },
    ];
    const db = createMockDB({ results: tweets });
    const locals = createLocals({ db });

    const response = await GET({
      request: createGetRequest(),
      locals,
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        id: 1,
        embed_html: "https://x.com/user/status/1",
        tweet_data: STORED_TWEET_DATA,
      },
      { id: 2, embed_html: "https://x.com/user/status/2", tweet_data: null },
    ]);
  });

  it("rewrites stored tweet video urls to signed proxy links", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T12:00:00.000Z"));

    const tweets = [
      {
        id: 1,
        embed_html: "https://x.com/user/status/1",
        tweet_json: JSON.stringify(STORED_TWEET_DATA_WITH_VIDEO),
      },
    ];
    const db = createMockDB({ results: tweets });
    const locals = createLocals({ db });

    const response = await GET({
      request: createGetRequest(),
      locals,
    } as never);

    expect(response.status).toBe(200);

    const json = (await response.json()) as Array<{
      tweet_data?: {
        mediaDetails?: Array<{
          video_info?: { variants?: Array<{ url: string }> };
        }>;
      } | null;
    }>;

    const proxyUrl = getSignedProxyUrl(
      json[0]?.tweet_data?.mediaDetails?.[0]?.video_info?.variants?.[0]?.url ??
        ""
    );

    expect(proxyUrl.pathname).toBe("/api/tweet/media");
    expect(proxyUrl.searchParams.get("url")).toBe(
      "https://video.twimg.com/ext_tw_video/123/pu/vid/avc1/320x400/tweet.mp4"
    );
    expect(proxyUrl.searchParams.get("exp")).toBeTruthy();
    expect(proxyUrl.searchParams.get("sig")).toBeTruthy();
  });

  it("does not bootstrap admin or rate-limit tables on public reads", async () => {
    const tweets = [{ id: 1, embed_html: "https://x.com/user/status/1" }];
    const db = createMockDB({
      missingTables: ["admin_sessions", "rate_limits"],
      results: tweets,
    });
    const locals = createLocals({ db });

    const response = await GET({
      request: createGetRequest(),
      locals,
    } as never);

    expect(response.status).toBe(200);
    expect(db.prepare).not.toHaveBeenCalledWith(
      expect.stringContaining("CREATE TABLE IF NOT EXISTS admin_sessions")
    );
    expect(db.prepare).not.toHaveBeenCalledWith(
      expect.stringContaining("CREATE TABLE IF NOT EXISTS rate_limits")
    );
  });

  it("migrates legacy databases missing tweet read columns before selecting", async () => {
    const tweets = [
      {
        id: 1,
        embed_html: "https://x.com/user/status/123",
        search_text: "hello world",
        tweet_json: JSON.stringify(STORED_TWEET_DATA),
        sort_order: 1,
        created_at: "2026-03-26T00:00:00.000Z",
      },
    ];

    const db = createMockDB({ results: tweets });
    db.state.setHasSearchTextColumn(false);
    db.state.setHasTweetJsonColumn(false);
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
    expect(db.prepare).toHaveBeenCalledWith(
      "ALTER TABLE tweets ADD COLUMN tweet_json TEXT"
    );
    await expect(response.json()).resolves.toEqual([
      {
        id: 1,
        embed_html: "https://x.com/user/status/123",
        search_text: "hello world",
        tweet_data: STORED_TWEET_DATA,
        sort_order: 1,
        created_at: "2026-03-26T00:00:00.000Z",
      },
    ]);
  });

  it("queries with sort_order ordering", async () => {
    const db = createMockDB();
    const locals = createLocals({ db });

    await GET({ request: createGetRequest(), locals } as never);

    expect(db.prepare).toHaveBeenCalledWith(
      "SELECT id, embed_html, search_text, tweet_json, sort_order, strftime('%Y-%m-%dT%H:%M:%fZ', created_at) AS created_at FROM tweets ORDER BY sort_order ASC, id ASC"
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
