import { enrichTweet } from "react-tweet";
import type { Tweet } from "react-tweet/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { enrichNoteTweet, normalizeTweetEntities } from "./note-tweet";

function makeTweet(overrides: Partial<Tweet> = {}): Tweet {
  const text = overrides.text ?? "Hello world";
  return {
    __typename: "Tweet",
    id_str: "1234567890",
    lang: "en",
    created_at: "2024-01-01T00:00:00.000Z",
    display_text_range: [0, Array.from(text).length],
    text,
    entities: {
      hashtags: [],
      urls: [],
      user_mentions: [],
      symbols: [],
    },
    user: {
      id_str: "1",
      name: "Test",
      screen_name: "test",
      profile_image_url_https: "",
      verified: false,
      is_blue_verified: false,
      profile_image_shape: "Circle",
    },
    edit_control: {
      edit_tweet_ids: ["1234567890"],
      editable_until_msecs: "0",
      is_edit_eligible: false,
      edits_remaining: "0",
    },
    isEdited: false,
    isStaleEdit: false,
    favorite_count: 0,
    conversation_count: 0,
    news_action_type: "conversation",
    ...overrides,
  } as Tweet;
}

function mockFxTwitter(fullText: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ code: 200, message: "OK", tweet: { text: fullText } }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    )
  );
}

describe("normalizeTweetEntities", () => {
  it("fills in missing entity arrays when syndication returns an empty entities object", () => {
    const tweet = makeTweet({
      entities: {} as unknown as Tweet["entities"],
    });

    const result = normalizeTweetEntities(tweet);

    expect(result.entities).toEqual({
      hashtags: [],
      urls: [],
      user_mentions: [],
      symbols: [],
    });
  });

  it("omits empty media entities so react-tweet enrichment does not throw", () => {
    const tweet = makeTweet({
      entities: {
        hashtags: [],
        urls: [],
        user_mentions: [],
        symbols: [],
        media: [],
      },
    });

    const result = normalizeTweetEntities(tweet);

    expect(result.entities.media).toBeUndefined();
    expect(() => enrichTweet(result)).not.toThrow();
  });

  it("normalizes quoted tweet entities before react-tweet enriches them", () => {
    const quotedTweet = {
      ...makeTweet({
        id_str: "quoted-tweet",
        entities: {
          hashtags: [],
          urls: [],
          user_mentions: [],
          symbols: [],
          media: [],
        },
      }),
      reply_count: 0,
      retweet_count: 0,
      self_thread: { id_str: "quoted-tweet" },
    };
    const tweet = makeTweet({
      quoted_tweet: quotedTweet,
    });

    const result = normalizeTweetEntities(tweet);

    expect(result.quoted_tweet?.entities.media).toBeUndefined();
    expect(() => enrichTweet(result)).not.toThrow();
  });

  it("preserves the original tweet reference when entities is already well-formed", () => {
    const tweet = makeTweet();
    expect(normalizeTweetEntities(tweet)).toBe(tweet);
  });
});

describe("enrichNoteTweet", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns tweet unchanged when note_tweet is absent", async () => {
    const tweet = makeTweet();
    const result = await enrichNoteTweet(tweet);
    expect(result).toBe(tweet);
  });

  it("normalizes a tweet whose syndication entities object is empty so downstream enrichTweet does not throw", async () => {
    const tweet = makeTweet({
      entities: {} as unknown as Tweet["entities"],
    });

    const result = await enrichNoteTweet(tweet);

    expect(result.entities.hashtags).toEqual([]);
    expect(result.entities.urls).toEqual([]);
    expect(result.entities.user_mentions).toEqual([]);
    expect(result.entities.symbols).toEqual([]);
  });

  it("does not call fetch when note_tweet is absent", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await enrichNoteTweet(makeTweet());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("upgrades suspiciously truncated long tweets even when note_tweet is absent", async () => {
    const truncatedText = "x".repeat(276);
    const fullText = `${truncatedText} and the rest of the tweet restored`;
    mockFxTwitter(fullText);

    const tweet = makeTweet({
      id_str: "9876543210",
      text: truncatedText,
      display_text_range: [0, truncatedText.length],
    });

    const result = await enrichNoteTweet(tweet);

    expect(result).not.toBe(tweet);
    expect(result.text).toBe(fullText);
    expect(result.display_text_range).toEqual([0, Array.from(fullText).length]);
  });

  it("replaces text and clears note_tweet on fxtwitter success", async () => {
    const fullText =
      "This is the complete long tweet text that was truncated before";
    mockFxTwitter(fullText);

    const tweet = makeTweet({
      text: "This is the comple…",
      note_tweet: { id: "abc" },
    });

    const result = await enrichNoteTweet(tweet);

    expect(result).not.toBe(tweet);
    expect(result.text).toBe(fullText);
    expect(result.note_tweet).toBeUndefined();
    expect(result.display_text_range).toEqual([0, Array.from(fullText).length]);
  });

  it("fetches from fxtwitter with correct URL", async () => {
    mockFxTwitter("full text");
    const tweet = makeTweet({
      id_str: "9876543210",
      text: "truncated…",
      note_tweet: { id: "abc" },
    });

    await enrichNoteTweet(tweet);

    expect(fetch).toHaveBeenCalledWith(
      "https://api.fxtwitter.com/i/status/9876543210",
      expect.objectContaining({
        headers: {
          Accept: "application/json",
          "User-Agent": expect.any(String),
        },
      })
    );
  });

  it("identifies worker fetches to fxtwitter so note tweet enrichment still works in production", async () => {
    const fullText =
      "This is the complete long tweet text that a worker can only fetch when it sends a user agent";
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        const userAgent = headers.get("User-Agent");

        return Promise.resolve(
          userAgent
            ? new Response(
                JSON.stringify({
                  code: 200,
                  message: "OK",
                  tweet: { text: fullText },
                }),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                }
              )
            : new Response(
                JSON.stringify({
                  error: "You must identify yourself with a User-Agent header.",
                }),
                {
                  status: 401,
                  headers: { "Content-Type": "application/json" },
                }
              )
        );
      })
    );

    const tweet = makeTweet({
      id_str: "9876543210",
      text: "This is the comple…",
      note_tweet: { id: "abc" },
    });

    const result = await enrichNoteTweet(tweet);

    expect(result.text).toBe(fullText);
    expect(result.note_tweet).toBeUndefined();
  });

  it("falls back to the alternate note tweet endpoint when the primary one fails", async () => {
    const fullText =
      "This is the complete long tweet text fetched from the fallback endpoint";
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response("Bad Gateway", { status: 502 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            tweet: {
              raw_text: {
                text: fullText,
                display_text_range: [0, Array.from(fullText).length],
              },
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      );
    vi.stubGlobal("fetch", fetchSpy);

    const tweet = makeTweet({
      id_str: "9876543210",
      text: "truncated…",
      note_tweet: { id: "abc" },
    });

    const result = await enrichNoteTweet(tweet);

    expect(result.text).toBe(fullText);
    expect(result.note_tweet).toBeUndefined();
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      "https://api.fxtwitter.com/i/status/9876543210",
      expect.objectContaining({
        headers: {
          Accept: "application/json",
          "User-Agent": expect.any(String),
        },
      })
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      "https://api.fxtwitter.com/status/9876543210",
      expect.objectContaining({
        headers: {
          Accept: "application/json",
          "User-Agent": expect.any(String),
        },
      })
    );
  });

  it("strips note_tweet when fxtwitter returns non-OK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Not Found", { status: 404 }))
    );
    const tweet = makeTweet({ text: "truncated…", note_tweet: { id: "abc" } });
    const result = await enrichNoteTweet(tweet);
    expect(result.note_tweet).toBeUndefined();
    expect(result.text).toBe("truncated…");
  });

  it("strips note_tweet when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error"))
    );
    const tweet = makeTweet({ text: "truncated…", note_tweet: { id: "abc" } });
    const result = await enrichNoteTweet(tweet);
    expect(result.note_tweet).toBeUndefined();
    expect(result.text).toBe("truncated…");
  });

  it("strips note_tweet when fxtwitter response has no text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 200, tweet: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    const tweet = makeTweet({ text: "truncated…", note_tweet: { id: "abc" } });
    const result = await enrichNoteTweet(tweet);
    expect(result.note_tweet).toBeUndefined();
    expect(result.text).toBe("truncated…");
  });

  it("remaps hashtag and mention indices to match full text", async () => {
    const fullText = "Extra prefix text @alice check #test stuff";
    mockFxTwitter(fullText);

    const tweet = makeTweet({
      text: "Short @alice #test…",
      note_tweet: { id: "abc" },
      entities: {
        hashtags: [{ indices: [13, 18], text: "test" }],
        urls: [],
        user_mentions: [
          {
            id_str: "100",
            indices: [6, 12],
            name: "Alice",
            screen_name: "alice",
          },
        ],
        symbols: [],
      },
    });

    const result = await enrichNoteTweet(tweet);
    const chars = Array.from(fullText);

    expect(
      chars.slice(...result.entities.user_mentions[0].indices).join("")
    ).toBe("@alice");
    expect(chars.slice(...result.entities.hashtags[0].indices).join("")).toBe(
      "#test"
    );
  });

  it("drops entities that cannot be found in full text", async () => {
    const fullText = "Full text with no matching entities here";
    mockFxTwitter(fullText);

    const tweet = makeTweet({
      text: "Old text #gone…",
      note_tweet: { id: "abc" },
      entities: {
        hashtags: [{ indices: [9, 14], text: "gone" }],
        urls: [],
        user_mentions: [],
        symbols: [],
      },
    });

    const result = await enrichNoteTweet(tweet);
    expect(result.entities.hashtags).toHaveLength(0);
  });

  it("handles unicode characters in text correctly", async () => {
    const fullText = "🎉🎊 Hello @bob world";
    mockFxTwitter(fullText);

    const tweet = makeTweet({
      text: "🎉🎊 Hel…",
      note_tweet: { id: "abc" },
      entities: {
        hashtags: [],
        urls: [],
        user_mentions: [
          {
            id_str: "200",
            indices: [4, 8],
            name: "Bob",
            screen_name: "bob",
          },
        ],
        symbols: [],
      },
    });

    const result = await enrichNoteTweet(tweet);
    const chars = Array.from(fullText);

    expect(result.entities.user_mentions).toHaveLength(1);
    expect(
      chars.slice(...result.entities.user_mentions[0].indices).join("")
    ).toBe("@bob");
  });

  it("remaps url entities using url, expanded_url, or display_url", async () => {
    const fullText = "Check https://t.co/abc123 for details";
    mockFxTwitter(fullText);

    const tweet = makeTweet({
      text: "Check https://t.co/abc123…",
      note_tweet: { id: "abc" },
      entities: {
        hashtags: [],
        urls: [
          {
            display_url: "example.com/page",
            expanded_url: "https://example.com/page",
            indices: [6, 26],
            url: "https://t.co/abc123",
          },
        ],
        user_mentions: [],
        symbols: [],
      },
    });

    const result = await enrichNoteTweet(tweet);
    const chars = Array.from(fullText);

    expect(result.entities.urls).toHaveLength(1);
    expect(chars.slice(...result.entities.urls[0].indices).join("")).toBe(
      "https://t.co/abc123"
    );
  });

  it("maps duplicate entities to successive occurrences", async () => {
    const fullText = "Hey @alice and @alice again #go #go";
    mockFxTwitter(fullText);

    const tweet = makeTweet({
      text: "Short @alice @alice…",
      note_tweet: { id: "abc" },
      entities: {
        hashtags: [
          { indices: [15, 18], text: "go" },
          { indices: [19, 22], text: "go" },
        ],
        urls: [],
        user_mentions: [
          {
            id_str: "100",
            indices: [6, 12],
            name: "Alice",
            screen_name: "alice",
          },
          {
            id_str: "100",
            indices: [13, 19],
            name: "Alice",
            screen_name: "alice",
          },
        ],
        symbols: [],
      },
    });

    const result = await enrichNoteTweet(tweet);
    const chars = Array.from(fullText);

    expect(result.entities.user_mentions).toHaveLength(2);
    expect(
      chars.slice(...result.entities.user_mentions[0].indices).join("")
    ).toBe("@alice");
    expect(
      chars.slice(...result.entities.user_mentions[1].indices).join("")
    ).toBe("@alice");
    expect(result.entities.user_mentions[0].indices[0]).toBeLessThan(
      result.entities.user_mentions[1].indices[0]
    );

    expect(result.entities.hashtags).toHaveLength(2);
    expect(chars.slice(...result.entities.hashtags[0].indices).join("")).toBe(
      "#go"
    );
    expect(chars.slice(...result.entities.hashtags[1].indices).join("")).toBe(
      "#go"
    );
    expect(result.entities.hashtags[0].indices[0]).toBeLessThan(
      result.entities.hashtags[1].indices[0]
    );
  });
});
