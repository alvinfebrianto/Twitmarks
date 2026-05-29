// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocals } from "../../../test/mock-db";
import { GET } from "./[id]";

const UPSTREAM_TWEET_WITH_VIDEO = {
  id_str: "123",
  text: "fresh full tweet",
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
  video: {
    aspectRatio: [4, 5],
    contentType: "media_entity",
    durationMs: 10_000,
    mediaAvailability: { status: "available" },
    poster: "https://pbs.twimg.com/ext_tw_video_thumb/123/pu/img/poster.jpg",
    variants: [
      {
        src: "https://video.twimg.com/ext_tw_video/123/pu/vid/avc1/320x400/tweet.mp4",
        type: "video/mp4",
      },
    ],
    videoId: { id: "123", type: "tweet" },
    viewCount: 0,
  },
} as const;

function getSignedProxyUrl(actual: string) {
  return new URL(actual, "http://localhost");
}

function createCacheStub(response: Response | null) {
  return {
    default: {
      match: vi.fn().mockResolvedValue(response),
      put: vi.fn().mockResolvedValue(undefined),
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("GET /api/tweet/[id]", () => {
  it("returns a cached response without fetching syndication again", async () => {
    const cachedResponse = new Response(
      JSON.stringify({ data: { id_str: "123", text: "cached tweet" } }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600, s-maxage=3600",
        },
      }
    );

    vi.stubGlobal("caches", createCacheStub(cachedResponse));
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("unexpected")))
    );

    const response = await GET({
      params: { id: "123" },
      request: new Request("http://localhost/api/tweet/123"),
      locals: createLocals(),
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { id_str: "123", text: "cached tweet" },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("bypasses stale cache entries from an older tweet cache version", async () => {
    const staleCachedResponse = new Response(
      JSON.stringify({
        data: { id_str: "123", text: "stale truncated tweet" },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600, s-maxage=3600",
        },
      }
    );
    const cache = {
      default: {
        match: vi.fn((request: Request) =>
          Promise.resolve(
            request.url === "http://localhost/api/tweet/123"
              ? staleCachedResponse
              : null
          )
        ),
        put: vi.fn().mockResolvedValue(undefined),
      },
    };
    vi.stubGlobal("caches", cache);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: () =>
          Promise.resolve({ id_str: "123", text: "fresh full tweet" }),
      })
    );

    const response = await GET({
      params: { id: "123" },
      request: new Request("http://localhost/api/tweet/123"),
      locals: createLocals(),
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { id_str: "123", text: "fresh full tweet" },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rewrites upstream tweet video urls to signed same-origin proxy urls", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T12:00:00.000Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve(UPSTREAM_TWEET_WITH_VIDEO),
      })
    );

    const response = await GET({
      params: { id: "123" },
      request: new Request("http://localhost/api/tweet/123"),
      locals: createLocals(),
    } as never);

    expect(response.status).toBe(200);

    const json = (await response.json()) as {
      data: {
        mediaDetails?: Array<{
          video_info?: { variants?: Array<{ url: string }> };
        }>;
        video?: { variants?: Array<{ src: string }> };
      };
    };

    const proxyUrl = getSignedProxyUrl(
      json.data.mediaDetails?.[0]?.video_info?.variants?.[0]?.url ?? ""
    );
    const topLevelProxyUrl = getSignedProxyUrl(
      json.data.video?.variants?.[0]?.src ?? ""
    );

    expect(proxyUrl.pathname).toBe("/api/tweet/media");
    expect(proxyUrl.searchParams.get("url")).toBe(
      "https://video.twimg.com/ext_tw_video/123/pu/vid/avc1/320x400/tweet.mp4"
    );
    expect(proxyUrl.searchParams.get("exp")).toBeTruthy();
    expect(proxyUrl.searchParams.get("sig")).toBeTruthy();
    expect(topLevelProxyUrl.pathname).toBe("/api/tweet/media");
    expect(topLevelProxyUrl.searchParams.get("url")).toBe(
      "https://video.twimg.com/ext_tw_video/123/pu/vid/avc1/320x400/tweet.mp4"
    );
    expect(topLevelProxyUrl.searchParams.get("exp")).toBeTruthy();
    expect(topLevelProxyUrl.searchParams.get("sig")).toBeTruthy();
  });

  it("returns 502 when the upstream rejects the syndication fetch", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve({
        ok: false,
        status: 403,
        headers: new Headers({ "content-type": "application/json" }),
      })
    );

    const response = await GET({
      params: { id: "123" },
      request: new Request("http://localhost/api/tweet/123"),
      locals: createLocals(),
    } as never);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ data: null });
  });
});
