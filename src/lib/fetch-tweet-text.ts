import { buildSyndicationUrl } from "./syndication";

export async function fetchTweetText(tweetId: string): Promise<string | null> {
  const url = buildSyndicationUrl(tweetId);

  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });

    const isJson = res.headers
      .get("content-type")
      ?.includes("application/json");

    if (!(res.ok && isJson)) {
      return null;
    }

    const data = (await res.json()) as {
      text?: string;
      user?: { name?: string; screen_name?: string };
    };

    if (!data || typeof data !== "object") {
      return null;
    }

    const parts: string[] = [];

    if (typeof data.text === "string" && data.text.trim()) {
      parts.push(data.text.trim());
    }

    if (data.user) {
      if (typeof data.user.name === "string" && data.user.name.trim()) {
        parts.push(data.user.name.trim());
      }
      if (
        typeof data.user.screen_name === "string" &&
        data.user.screen_name.trim()
      ) {
        parts.push(`@${data.user.screen_name.trim()}`);
      }
    }

    return parts.length > 0 ? parts.join(" ") : null;
  } catch {
    return null;
  }
}
