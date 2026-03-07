import { describe, expect, it } from "vitest";
import { canReorder, moveTweet, type TweetOrderItem } from "./tweet-order";

const makeTweets = (count: number): TweetOrderItem[] =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    sort_order: i + 1,
  }));

describe("moveTweet", () => {
  it("swaps a tweet with the previous one when moving up", () => {
    const tweets = makeTweets(3);
    const result = moveTweet(tweets, 2, "up");
    expect(result.map((t) => t.id)).toEqual([2, 1, 3]);
  });

  it("swaps a tweet with the next one when moving down", () => {
    const tweets = makeTweets(3);
    const result = moveTweet(tweets, 2, "down");
    expect(result.map((t) => t.id)).toEqual([1, 3, 2]);
  });

  it("is a no-op when moving the first item up", () => {
    const tweets = makeTweets(3);
    const result = moveTweet(tweets, 1, "up");
    expect(result.map((t) => t.id)).toEqual([1, 2, 3]);
  });

  it("is a no-op when moving the last item down", () => {
    const tweets = makeTweets(3);
    const result = moveTweet(tweets, 3, "down");
    expect(result.map((t) => t.id)).toEqual([1, 2, 3]);
  });

  it("normalizes sort_order values after move", () => {
    const tweets = makeTweets(3);
    const result = moveTweet(tweets, 3, "up");
    expect(result.map((t) => t.sort_order)).toEqual([1, 2, 3]);
  });
});

describe("canReorder", () => {
  it("returns true for Manual sort with no filters", () => {
    expect(
      canReorder({
        sortOption: "Manual",
        searchQuery: "",
        dateFilter: "All Time",
      })
    ).toBe(true);
  });

  it("returns false when sort is not Manual", () => {
    expect(
      canReorder({
        sortOption: "Newest",
        searchQuery: "",
        dateFilter: "All Time",
      })
    ).toBe(false);
  });

  it("returns false when search query is active", () => {
    expect(
      canReorder({
        sortOption: "Manual",
        searchQuery: "hello",
        dateFilter: "All Time",
      })
    ).toBe(false);
  });

  it("returns false when date filter is active", () => {
    expect(
      canReorder({
        sortOption: "Manual",
        searchQuery: "",
        dateFilter: "This Week",
      })
    ).toBe(false);
  });
});
