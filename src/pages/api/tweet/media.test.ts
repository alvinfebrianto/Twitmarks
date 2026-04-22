// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTweetMediaProxySigner } from "../../../lib/syndication";
import { createLocals } from "../../../test/mock-db";
import { GET, HEAD } from "./media";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function createSignedMediaRequest(
  mediaUrl: string,
  init?: RequestInit
): Promise<{ locals: App.Locals; request: Request }> {
  const locals = createLocals();
  const signTweetMediaUrl = await createTweetMediaProxySigner(
    locals.runtime.env.DB,
    locals.runtime.env.ADMIN_SECRET
  );
  const signedPath = await signTweetMediaUrl(mediaUrl);

  return {
    locals,
    request: new Request(`http://localhost${signedPath}`, init),
  };
}

describe("GET /api/tweet/media", () => {
  it("sends a Twitmarks user-agent when proxying twitter media upstream", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response("video-bytes", {
        status: 200,
        headers: {
          "Content-Type": "video/mp4",
        },
      })
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { locals, request } = await createSignedMediaRequest(
      "https://video.twimg.com/amplify_video/123/vid/avc1/480x600/tweet.mp4"
    );

    const response = await GET({ request, locals } as never);

    expect(response.status).toBe(200);

    const upstreamInit = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(upstreamInit.headers).toBeInstanceOf(Headers);
    expect((upstreamInit.headers as Headers).get("User-Agent")).toContain(
      "Twitmarks/1.0"
    );
  });

  it("keeps streaming media after the upstream response headers have already arrived", async () => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => {
      const controller = new AbortController();
      setTimeout(() => {
        controller.abort();
      }, 10_000);
      return controller.signal;
    });

    const encoder = new TextEncoder();
    const fetchSpy = vi
      .fn()
      .mockImplementation((_input, init?: RequestInit) => {
        const signal = init?.signal;
        const stream = new ReadableStream({
          start(controller) {
            let aborted = false;

            signal?.addEventListener("abort", () => {
              aborted = true;
              controller.error(
                new DOMException("stream aborted", "AbortError")
              );
            });

            setTimeout(() => {
              if (aborted) {
                return;
              }

              controller.enqueue(encoder.encode("video-bytes"));
              controller.close();
            }, 11_000);
          },
        });

        return Promise.resolve(
          new Response(stream, {
            status: 206,
            headers: {
              "Accept-Ranges": "bytes",
              "Content-Range": "bytes 0-10/11",
              "Content-Type": "video/mp4",
            },
          })
        );
      });
    vi.stubGlobal("fetch", fetchSpy);

    const { locals, request } = await createSignedMediaRequest(
      "https://video.twimg.com/amplify_video/123/vid/avc1/480x600/tweet.mp4"
    );

    const response = await GET({ request, locals } as never);

    await vi.advanceTimersByTimeAsync(11_000);

    await expect(response.text()).resolves.toBe("video-bytes");
  });

  it("proxies twitter video responses and forwards range requests", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response("video-bytes", {
        status: 206,
        headers: {
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=604800",
          "Content-Length": "11",
          "Content-Range": "bytes 0-10/11",
          "Content-Type": "video/mp4",
          ETag: '"tweet-video"',
          "Last-Modified": "Thu, 16 Apr 2026 13:35:46 GMT",
        },
      })
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { locals, request } = await createSignedMediaRequest(
      "https://video.twimg.com/amplify_video/123/vid/avc1/480x600/tweet.mp4",
      {
        headers: {
          Range: "bytes=0-10",
          "If-Range": '"tweet-video"',
        },
      }
    );

    const response = await GET({
      request,
      locals,
    } as never);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0].toString()).toBe(
      "https://video.twimg.com/amplify_video/123/vid/avc1/480x600/tweet.mp4"
    );

    const upstreamInit = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(upstreamInit.headers).toBeInstanceOf(Headers);
    expect((upstreamInit.headers as Headers).get("Range")).toBe("bytes=0-10");
    expect((upstreamInit.headers as Headers).get("If-Range")).toBe(
      '"tweet-video"'
    );
    expect((upstreamInit.headers as Headers).get("Referer")).toBeNull();

    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Type")).toBe("video/mp4");
    expect(response.headers.get("Content-Range")).toBe("bytes 0-10/11");
    await expect(response.text()).resolves.toBe("video-bytes");
  });

  it("returns 502 when the upstream media url responds with a redirect", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(
        Response.redirect("https://example.com/elsewhere.mp4", 302)
      );
    vi.stubGlobal("fetch", fetchSpy);

    const { locals, request } = await createSignedMediaRequest(
      "https://video.twimg.com/amplify_video/123/vid/avc1/480x600/tweet.mp4"
    );

    const response = await GET({ request, locals } as never);

    expect(response.status).toBe(502);
  });

  it("rejects non-twitter media urls", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await GET({
      request: new Request(
        "http://localhost/api/tweet/media?url=https%3A%2F%2Fevil.example%2Ftweet.mp4"
      ),
      locals: createLocals(),
    } as never);

    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects unsigned twitter media urls so the proxy cannot be used as a public relay", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await GET({
      request: new Request(
        "http://localhost/api/tweet/media?url=https%3A%2F%2Fvideo.twimg.com%2Famplify_video%2F123%2Fvid%2Favc1%2F480x600%2Ftweet.mp4"
      ),
      locals: createLocals(),
    } as never);

    expect(response.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("forwards HEAD requests upstream without downloading the body", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Length": "11",
          "Content-Type": "video/mp4",
        },
      })
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { locals, request } = await createSignedMediaRequest(
      "https://video.twimg.com/amplify_video/123/vid/avc1/480x600/tweet.mp4",
      {
        method: "HEAD",
      }
    );

    const response = await HEAD({ request, locals } as never);

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const upstreamInit = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(upstreamInit.method).toBe("HEAD");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("video/mp4");
    await expect(response.text()).resolves.toBe("");
  });
});
