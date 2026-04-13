import type { Tweet } from "react-tweet/api";

const NOTE_TWEET_SOURCE_URLS = [
  "https://api.fxtwitter.com/i/status",
  "https://api.fxtwitter.com/status",
] as const;
const NOTE_TWEET_TIMEOUT_MS = 5000;
const NOTE_TWEET_USER_AGENT =
  "Mozilla/5.0 (compatible; Twitmarks/1.0; +https://twitmarks.alvinpelajar.workers.dev)";
const TRUNCATED_LONG_TWEET_MIN_LENGTH = 260;
const TRUNCATED_LONG_TWEET_MAX_LENGTH = 280;

interface FullNoteTweet {
  displayTextRange: [number, number];
  text: string;
}

export async function enrichNoteTweet(tweet: Tweet): Promise<Tweet> {
  if (!(tweet.note_tweet || isSuspiciousLongTweet(tweet))) {
    return tweet;
  }

  const stripNoteTweet = (t: Tweet): Tweet => ({ ...t, note_tweet: undefined });

  try {
    const fullNoteTweet = await fetchFullTweetText(tweet.id_str);

    if (!fullNoteTweet) {
      return tweet.note_tweet ? stripNoteTweet(tweet) : tweet;
    }

    if (!(tweet.note_tweet || hasRicherText(tweet, fullNoteTweet))) {
      return tweet;
    }
    const textChars = Array.from(fullNoteTweet.text);

    return {
      ...tweet,
      text: fullNoteTweet.text,
      display_text_range: fullNoteTweet.displayTextRange,
      entities: remapEntities(tweet.entities, textChars),
      note_tweet: undefined,
    };
  } catch {
    return tweet.note_tweet ? stripNoteTweet(tweet) : tweet;
  }
}

async function fetchFullTweetText(
  tweetId: string
): Promise<FullNoteTweet | null> {
  for (const baseUrl of NOTE_TWEET_SOURCE_URLS) {
    try {
      const response = await fetch(`${baseUrl}/${tweetId}`, {
        headers: {
          Accept: "application/json",
          "User-Agent": NOTE_TWEET_USER_AGENT,
        },
        signal: AbortSignal.timeout(NOTE_TWEET_TIMEOUT_MS),
      });

      if (!response.ok) {
        continue;
      }

      const data = (await response.json()) as {
        tweet?: {
          raw_text?: {
            display_text_range?: [number, number];
            text?: string;
          };
          text?: string;
        };
      };
      const fullText = data.tweet?.raw_text?.text ?? data.tweet?.text;

      if (typeof fullText !== "string" || !fullText) {
        continue;
      }

      const textChars = Array.from(fullText);
      const displayTextRange: [number, number] = isDisplayTextRange(
        data.tweet?.raw_text?.display_text_range,
        textChars.length
      )
        ? data.tweet.raw_text.display_text_range
        : [0, textChars.length];

      return {
        displayTextRange,
        text: fullText,
      };
    } catch {
      // Try the next note-tweet source before falling back to the preview text.
    }
  }

  return null;
}

function hasRicherText(tweet: Tweet, fullTweet: FullNoteTweet): boolean {
  const currentTextLength = Array.from(tweet.text).length;
  const fullTextLength = Array.from(fullTweet.text).length;

  return (
    fullTweet.text !== tweet.text &&
    (fullTextLength > currentTextLength ||
      fullTweet.displayTextRange[1] > tweet.display_text_range[1])
  );
}

function isSuspiciousLongTweet(tweet: Tweet): boolean {
  const textLength = Array.from(tweet.text).length;

  return (
    textLength >= TRUNCATED_LONG_TWEET_MIN_LENGTH &&
    textLength <= TRUNCATED_LONG_TWEET_MAX_LENGTH &&
    tweet.display_text_range[0] === 0 &&
    tweet.display_text_range[1] === textLength
  );
}

function isDisplayTextRange(
  value: [number, number] | undefined,
  textLength: number
): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    Number.isInteger(value[0]) &&
    Number.isInteger(value[1]) &&
    value[0] >= 0 &&
    value[1] <= textLength &&
    value[0] <= value[1]
  );
}

function remapEntities(
  entities: Tweet["entities"],
  textChars: string[]
): Tweet["entities"] {
  let hashtagOffset = 0;
  let urlOffset = 0;
  let mentionOffset = 0;
  let symbolOffset = 0;
  let mediaOffset = 0;

  return {
    hashtags: [...entities.hashtags]
      .sort((a, b) => a.indices[0] - b.indices[0])
      .flatMap((e) => {
        const indices = findRange(textChars, `#${e.text}`, hashtagOffset);
        if (indices) {
          hashtagOffset = indices[1];
          return [{ ...e, indices }];
        }
        return [];
      }),
    urls: [...entities.urls]
      .sort((a, b) => a.indices[0] - b.indices[0])
      .flatMap((e) => {
        const candidates = [e.url, e.expanded_url, e.display_url].filter(
          Boolean
        );
        for (const candidate of candidates) {
          const indices = findRange(textChars, candidate, urlOffset);
          if (indices) {
            urlOffset = indices[1];
            return [{ ...e, indices }];
          }
        }
        return [];
      }),
    user_mentions: [...entities.user_mentions]
      .sort((a, b) => a.indices[0] - b.indices[0])
      .flatMap((e) => {
        const indices = findRange(
          textChars,
          `@${e.screen_name}`,
          mentionOffset
        );
        if (indices) {
          mentionOffset = indices[1];
          return [{ ...e, indices }];
        }
        return [];
      }),
    symbols: [...entities.symbols]
      .sort((a, b) => a.indices[0] - b.indices[0])
      .flatMap((e) => {
        const indices = findRange(textChars, `$${e.text}`, symbolOffset);
        if (indices) {
          symbolOffset = indices[1];
          return [{ ...e, indices }];
        }
        return [];
      }),
    ...(entities.media
      ? {
          media: [...entities.media]
            .sort((a, b) => a.indices[0] - b.indices[0])
            .flatMap((e) => {
              const candidates = [e.url, e.expanded_url, e.display_url].filter(
                Boolean
              );
              for (const candidate of candidates) {
                const indices = findRange(textChars, candidate, mediaOffset);
                if (indices) {
                  mediaOffset = indices[1];
                  return [{ ...e, indices }];
                }
              }
              return [];
            }),
        }
      : {}),
  };
}

function findRange(
  textChars: string[],
  needle: string,
  from: number
): [number, number] | null {
  const needleChars = Array.from(needle);
  const len = needleChars.length;

  for (let i = from; i <= textChars.length - len; i++) {
    let match = true;
    for (let j = 0; j < len; j++) {
      if (textChars[i + j] !== needleChars[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      return [i, i + len];
    }
  }

  return null;
}
