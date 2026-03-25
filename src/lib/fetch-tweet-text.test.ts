import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTweetText } from "./fetch-tweet-text";

describe("fetchTweetText", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns tweet text and user info on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: () =>
          Promise.resolve({
            text: "Hello world",
            user: { name: "Test User", screen_name: "testuser" },
          }),
      })
    );

    const result = await fetchTweetText("123456789");

    expect(result).toBe("Hello world Test User @testuser");
  });

  it("returns just text when user info is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve({ text: "Hello world" }),
      })
    );

    const result = await fetchTweetText("123456789");

    expect(result).toBe("Hello world");
  });

  it("returns null when fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network error"))
    );

    const result = await fetchTweetText("123456789");

    expect(result).toBeNull();
  });

  it("returns null when response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        headers: new Headers({ "content-type": "application/json" }),
      })
    );

    const result = await fetchTweetText("123456789");

    expect(result).toBeNull();
  });

  it("returns null when response is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "text/html" }),
      })
    );

    const result = await fetchTweetText("123456789");

    expect(result).toBeNull();
  });

  it("returns null when text is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve({ text: "" }),
      })
    );

    const result = await fetchTweetText("123456789");

    expect(result).toBeNull();
  });
});
