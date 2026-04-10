const SYNDICATION_URL = "https://cdn.syndication.twimg.com";

const SYNDICATION_FEATURES = [
  "tfw_timeline_list:",
  "tfw_follower_count_sunset:true",
  "tfw_tweet_edit_backend:on",
  "tfw_refsrc_session:on",
  "tfw_fosnr_soft_interventions_enabled:on",
  "tfw_show_birdwatch_pivots_enabled:on",
  "tfw_show_business_verified_badge:on",
  "tfw_duplicate_scribes_to_settings:on",
  "tfw_use_profile_image_shape_enabled:on",
  "tfw_show_blue_verified_badge:on",
  "tfw_legacy_timeline_sunset:true",
  "tfw_show_gov_verified_badge:on",
  "tfw_show_business_affiliate_badge:on",
  "tfw_tweet_edit_frontend:on",
].join(";");

const SYNDICATION_USER_AGENT =
  "Mozilla/5.0 (compatible; Twitmarks/1.0; +https://twitmarks.alvinpelajar.workers.dev)";

function getToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI)
    .toString(6 ** 2)
    .replace(/(0+|\.)/g, "");
}

export function buildSyndicationUrl(tweetId: string): URL {
  const url = new URL(`${SYNDICATION_URL}/tweet-result`);
  url.searchParams.set("id", tweetId);
  url.searchParams.set("lang", "en");
  url.searchParams.set("features", SYNDICATION_FEATURES);
  url.searchParams.set("token", getToken(tweetId));
  return url;
}

export function buildSyndicationRequestInit(timeoutMs = 5000): RequestInit {
  return {
    headers: {
      Accept: "application/json",
      "User-Agent": SYNDICATION_USER_AGENT,
    },
    signal: AbortSignal.timeout(timeoutMs),
  };
}
