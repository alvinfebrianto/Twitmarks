import type { Tweet } from "react-tweet/api";

const FXTWITTER_URL = "https://api.fxtwitter.com/i/status";

export async function enrichNoteTweet(tweet: Tweet): Promise<Tweet> {
  if (!tweet.note_tweet) {
    return tweet;
  }

  const stripNoteTweet = (t: Tweet): Tweet => ({ ...t, note_tweet: undefined });

  try {
    const res = await fetch(`${FXTWITTER_URL}/${tweet.id_str}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      return stripNoteTweet(tweet);
    }

    const data = (await res.json()) as {
      tweet?: { text?: string };
    };
    const fullText = data?.tweet?.text;

    if (typeof fullText !== "string" || !fullText) {
      return stripNoteTweet(tweet);
    }

    const textChars = Array.from(fullText);

    return {
      ...tweet,
      text: fullText,
      display_text_range: [0, textChars.length],
      entities: remapEntities(tweet.entities, textChars),
      note_tweet: undefined,
    };
  } catch {
    return stripNoteTweet(tweet);
  }
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
