export interface DbTweet {
  created_at: string;
  embed_html: string;
  id: number;
  search_text?: string | null;
  sort_order: number;
}

export interface UiTweet extends DbTweet {
  createdAtMs: number;
  searchBlob: string;
}

export interface TweetPhoto {
  height: number;
  url: string;
  width: number;
}

const TWEET_ID_RE = /(?:twitter|x)\.com\/\w+\/status\/(\d+)/;

function extractTextContent(html: string): string {
  if (typeof DOMParser === "undefined") {
    return html.replace(/<[^>]*>/g, " ").toLowerCase();
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent ?? "").toLowerCase();
}

export function normalizeTweet(tweet: DbTweet): UiTweet {
  return {
    ...tweet,
    createdAtMs: new Date(tweet.created_at).getTime(),
    searchBlob: tweet.search_text
      ? tweet.search_text.toLowerCase()
      : extractTextContent(tweet.embed_html),
  };
}

export function extractTweetId(html: string): string | null {
  const match = html.match(TWEET_ID_RE);
  return match?.[1] ?? null;
}

export function pruneSelectedIds(
  prev: Set<number>,
  visibleIds: Set<number>
): Set<number> {
  if (prev.size === 0) {
    return prev;
  }
  const next = new Set([...prev].filter((id) => visibleIds.has(id)));
  return next.size === prev.size ? prev : next;
}

export function filterTweets(
  tweets: UiTweet[],
  options: { searchQuery: string; dateFilter: string; sortOption: string }
): UiTweet[] {
  let result = [...tweets];

  if (options.searchQuery) {
    const q = options.searchQuery.toLowerCase();
    result = result.filter((t) => t.searchBlob.includes(q));
  }

  const now = Date.now();
  if (options.dateFilter === "Last 7 Days") {
    const cutoff = now - 7 * 24 * 60 * 60 * 1000;
    result = result.filter((t) => t.createdAtMs > cutoff);
  } else if (options.dateFilter === "Last 30 Days") {
    const cutoff = now - 30 * 24 * 60 * 60 * 1000;
    result = result.filter((t) => t.createdAtMs > cutoff);
  }

  if (options.sortOption === "Newest") {
    result.sort((a, b) => b.createdAtMs - a.createdAtMs);
  } else if (options.sortOption === "Oldest") {
    result.sort((a, b) => a.createdAtMs - b.createdAtMs);
  }

  return result;
}
