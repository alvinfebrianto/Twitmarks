import type { Tweet } from "react-tweet/api";
import { enrichNoteTweet } from "./note-tweet";
import {
  buildSyndicationRequestInit,
  buildSyndicationUrl,
} from "./syndication";

export interface TweetSnapshot {
  searchText: string | null;
  tweetData: Tweet | null;
}

function isTweetData(value: unknown): value is Tweet {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const maybeTweet = value as {
    id_str?: unknown;
    text?: unknown;
    user?: { name?: unknown; screen_name?: unknown };
  };

  return (
    typeof maybeTweet.id_str === "string" &&
    typeof maybeTweet.text === "string" &&
    typeof maybeTweet.user === "object" &&
    maybeTweet.user !== null
  );
}

function buildTweetSearchText(tweetData: Tweet): string | null {
  const parts: string[] = [];

  if (tweetData.text.trim()) {
    parts.push(tweetData.text.trim());
  }

  if (tweetData.user.name.trim()) {
    parts.push(tweetData.user.name.trim());
  }

  if (tweetData.user.screen_name.trim()) {
    parts.push(`@${tweetData.user.screen_name.trim()}`);
  }

  return parts.length > 0 ? parts.join(" ") : null;
}

export async function fetchTweetSnapshot(
  tweetId: string
): Promise<TweetSnapshot> {
  try {
    const url = buildSyndicationUrl(tweetId);
    const response = await fetch(url.toString(), buildSyndicationRequestInit());
    const isJson = response.headers
      .get("content-type")
      ?.includes("application/json");

    if (!(response.ok && isJson)) {
      return { searchText: null, tweetData: null };
    }

    const body = await response.json();
    if (!isTweetData(body)) {
      return { searchText: null, tweetData: null };
    }

    const tweetData = await enrichNoteTweet(body);

    return {
      searchText: buildTweetSearchText(tweetData),
      tweetData,
    };
  } catch {
    return { searchText: null, tweetData: null };
  }
}

export function serializeStoredTweetData(
  tweetData: Tweet | null | undefined
): string | null {
  return tweetData ? JSON.stringify(tweetData) : null;
}

export function parseStoredTweetData(value: unknown): Tweet | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return isTweetData(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
