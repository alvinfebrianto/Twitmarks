export interface TweetOrderItem {
  id: number;
  sort_order: number;
}

export function moveTweet<T extends TweetOrderItem>(
  tweets: T[],
  tweetId: number,
  direction: "up" | "down"
): T[] {
  const index = tweets.findIndex((t) => t.id === tweetId);
  if (index === -1) {
    return tweets;
  }

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= tweets.length) {
    return tweets;
  }

  const result = [...tweets];
  const temp = result[index];
  result[index] = result[targetIndex];
  result[targetIndex] = temp;

  return result.map((t, i) => ({ ...t, sort_order: i + 1 }));
}

export function canReorder({
  sortOption,
  searchQuery,
  dateFilter,
}: {
  sortOption: string;
  searchQuery: string;
  dateFilter: string;
}): boolean {
  return (
    sortOption === "Manual" && searchQuery === "" && dateFilter === "All Time"
  );
}
