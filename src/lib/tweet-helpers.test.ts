import { describe, expect, it } from "vitest";
import {
  type DbTweet,
  filterTweets,
  normalizeTweet,
  type UiTweet,
} from "./tweet-helpers";

function makeTweet(overrides: Partial<DbTweet> = {}): DbTweet {
  return {
    id: 1,
    embed_html: "<blockquote><p>hello world</p></blockquote>",
    sort_order: 1,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("normalizeTweet", () => {
  it("uses search_text for searchBlob when available", () => {
    const tweet = makeTweet({
      embed_html: "https://x.com/user/status/123",
      search_text: "Ugm! Info beasiswa belajar AI",
    });

    const result = normalizeTweet(tweet);

    expect(result.searchBlob).toBe("ugm! info beasiswa belajar ai");
  });

  it("falls back to extractTextContent when search_text is null", () => {
    const tweet = makeTweet({
      embed_html: "<blockquote><p>hello world</p></blockquote>",
      search_text: null,
    });

    const result = normalizeTweet(tweet);

    expect(result.searchBlob).toContain("hello world");
  });

  it("falls back to extractTextContent when search_text is undefined", () => {
    const tweet = makeTweet({
      embed_html: "<blockquote><p>hello world</p></blockquote>",
    });

    const result = normalizeTweet(tweet);

    expect(result.searchBlob).toContain("hello world");
  });

  it("falls back to extractTextContent when search_text is empty string", () => {
    const tweet = makeTweet({
      embed_html: "<blockquote><p>hello world</p></blockquote>",
      search_text: "",
    });

    const result = normalizeTweet(tweet);

    expect(result.searchBlob).toContain("hello world");
  });
});

describe("filterTweets - search with search_text", () => {
  it("finds URL-only tweet by its search_text content", () => {
    const tweets: UiTweet[] = [
      normalizeTweet(
        makeTweet({
          embed_html: "https://x.com/user/status/123",
          search_text: "Ugm! Info beasiswa belajar AI dari Microsoft",
        })
      ),
    ];

    const result = filterTweets(tweets, {
      searchQuery: "beasiswa",
      dateFilter: "All Time",
      sortOption: "Newest",
    });

    expect(result).toHaveLength(1);
  });

  it("does not find URL-only tweet without search_text when searching tweet content", () => {
    const tweets: UiTweet[] = [
      normalizeTweet(
        makeTweet({
          embed_html: "https://x.com/user/status/123",
          search_text: null,
        })
      ),
    ];

    const result = filterTweets(tweets, {
      searchQuery: "beasiswa",
      dateFilter: "All Time",
      sortOption: "Newest",
    });

    expect(result).toHaveLength(0);
  });
});
