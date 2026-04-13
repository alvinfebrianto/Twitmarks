// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocals } from "../../../test/mock-db";
import { GET } from "./[id]";

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
