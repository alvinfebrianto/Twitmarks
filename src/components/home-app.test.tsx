import { describe, expect, it } from "vitest";
import type { DbTweet } from "./home-app";

describe("HomeApp types", () => {
  it("DbTweet matches the API response shape", () => {
    const apiResponse: DbTweet = {
      id: 1,
      embed_html:
        '<blockquote class="twitter-tweet"><p>Hello world</p></blockquote>',
      created_at: "2025-03-01T00:00:00Z",
      sort_order: 1,
    };

    expect(apiResponse.id).toBe(1);
    expect(apiResponse.embed_html).toContain("twitter-tweet");
    expect(apiResponse.created_at).toBeTruthy();
    expect(apiResponse.sort_order).toBe(1);
  });

  it("DbTweet array can be sorted by created_at", () => {
    const tweets: DbTweet[] = [
      {
        id: 1,
        embed_html: "<blockquote>old</blockquote>",
        created_at: "2025-01-01T00:00:00Z",
        sort_order: 1,
      },
      {
        id: 2,
        embed_html: "<blockquote>new</blockquote>",
        created_at: "2025-03-01T00:00:00Z",
        sort_order: 2,
      },
    ];

    const sorted = [...tweets].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    expect(sorted[0].id).toBe(2);
    expect(sorted[1].id).toBe(1);
  });

  it("DbTweet embed_html can be searched", () => {
    const tweets: DbTweet[] = [
      {
        id: 1,
        embed_html:
          '<blockquote class="twitter-tweet"><p>Hello world</p></blockquote>',
        created_at: "2025-03-01T00:00:00Z",
        sort_order: 1,
      },
      {
        id: 2,
        embed_html:
          '<blockquote class="twitter-tweet"><p>Goodbye moon</p></blockquote>',
        created_at: "2025-03-01T00:00:00Z",
        sort_order: 2,
      },
    ];

    const q = "hello";
    const filtered = tweets.filter((t) =>
      t.embed_html.toLowerCase().includes(q)
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(1);
  });
});
