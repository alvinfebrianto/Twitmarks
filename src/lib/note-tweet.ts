import type { Tweet } from "react-tweet/api";

const FXTWITTER_URL = "https://api.fxtwitter.com/i/status";

export async function enrichNoteTweet(tweet: Tweet): Promise<Tweet> {
  if (!tweet.note_tweet) {
    return tweet;
  }

  try {
    const res = await fetch(`${FXTWITTER_URL}/${tweet.id_str}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      return tweet;
    }

    const data = (await res.json()) as {
      tweet?: { text?: string };
    };
    const fullText = data?.tweet?.text;

    if (typeof fullText !== "string" || !fullText) {
      return tweet;
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
    return tweet;
  }
}

function remapEntities(
  entities: Tweet["entities"],
  textChars: string[]
): Tweet["entities"] {
  return {
    hashtags: entities.hashtags.flatMap((e) => {
      const indices = findRange(textChars, `#${e.text}`, 0);
      return indices ? [{ ...e, indices }] : [];
    }),
    urls: entities.urls.flatMap((e) => {
      const candidates = [e.url, e.expanded_url, e.display_url].filter(Boolean);
      for (const candidate of candidates) {
        const indices = findRange(textChars, candidate, 0);
        if (indices) {
          return [{ ...e, indices }];
        }
      }
      return [];
    }),
    user_mentions: entities.user_mentions.flatMap((e) => {
      const indices = findRange(textChars, `@${e.screen_name}`, 0);
      return indices ? [{ ...e, indices }] : [];
    }),
    symbols: entities.symbols.flatMap((e) => {
      const indices = findRange(textChars, `$${e.text}`, 0);
      return indices ? [{ ...e, indices }] : [];
    }),
    ...(entities.media
      ? {
          media: entities.media.flatMap((e) => {
            const candidates = [e.url, e.expanded_url, e.display_url].filter(
              Boolean
            );
            for (const candidate of candidates) {
              const indices = findRange(textChars, candidate, 0);
              if (indices) {
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
