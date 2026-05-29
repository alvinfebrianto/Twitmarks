import type { Tweet } from "react-tweet/api";
import { resolveConfiguredAdminSecretHash } from "./admin-session";
import type { Database } from "./db";

const SYNDICATION_URL = "https://cdn.syndication.twimg.com";
const TWEET_MEDIA_HOSTNAME = "video.twimg.com";
const TWEET_MEDIA_PROXY_PATH = "/api/tweet/media";
const TWEET_MEDIA_PROXY_EXP_PARAM = "exp";
const TWEET_MEDIA_PROXY_SIGNATURE_PARAM = "sig";
const TWEET_MEDIA_PROXY_TTL_SECONDS = 60 * 60 * 2;
const INTEGER_RE = /^\d+$/;

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

export function parseTweetMediaUrl(input: string): URL | null {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") {
    return null;
  }

  if (url.username || url.password) {
    return null;
  }

  return url.hostname === TWEET_MEDIA_HOSTNAME ? url : null;
}

export function buildTweetMediaProxyUrl(mediaUrl: string): string {
  const parsedUrl = parseTweetMediaUrl(mediaUrl);

  if (!parsedUrl) {
    return mediaUrl;
  }

  return `${TWEET_MEDIA_PROXY_PATH}?url=${encodeURIComponent(parsedUrl.toString())}`;
}

export type TweetMediaProxySigner = (mediaUrl: string) => Promise<string>;

interface TweetMediaNode {
  mediaDetails?: Tweet["mediaDetails"];
  quoted_tweet?: TweetMediaNode | null;
  video?: Tweet["video"];
}

function buildTweetMediaProxySignaturePayload(
  mediaUrl: string,
  expiresAt: number
): string {
  return `${String(expiresAt)}:${mediaUrl}`;
}

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);

  // biome-ignore lint/suspicious/noBitwiseOperators: constant-time comparison requires bitwise XOR
  let diff = aBytes.length ^ bBytes.length;
  const max = Math.max(aBytes.length, bBytes.length);

  for (let i = 0; i < max; i++) {
    // biome-ignore lint/suspicious/noBitwiseOperators: constant-time comparison requires bitwise XOR and OR
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }

  return diff === 0;
}

async function createTweetMediaProxySignature(
  cryptoKey: CryptoKey,
  encoder: TextEncoder,
  mediaUrl: string,
  expiresAt: number
): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(buildTweetMediaProxySignaturePayload(mediaUrl, expiresAt))
  );

  return [...new Uint8Array(signature)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function appendSignedTweetMediaParams(
  mediaUrl: string,
  expiresAt: number,
  signature: string
): string {
  return `${TWEET_MEDIA_PROXY_PATH}?url=${encodeURIComponent(mediaUrl)}&${TWEET_MEDIA_PROXY_EXP_PARAM}=${String(expiresAt)}&${TWEET_MEDIA_PROXY_SIGNATURE_PARAM}=${signature}`;
}

export async function createTweetMediaProxySigner(
  db: Database,
  configuredSecret?: string,
  nowMs = Date.now()
): Promise<TweetMediaProxySigner> {
  const signingKey = await resolveConfiguredAdminSecretHash(
    db,
    configuredSecret
  );
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const expiresAt = Math.floor(nowMs / 1000) + TWEET_MEDIA_PROXY_TTL_SECONDS;

  return async (mediaUrl: string) => {
    const parsedUrl = parseTweetMediaUrl(mediaUrl);

    if (!parsedUrl) {
      return mediaUrl;
    }

    const normalizedUrl = parsedUrl.toString();
    const signature = await createTweetMediaProxySignature(
      cryptoKey,
      encoder,
      normalizedUrl,
      expiresAt
    );

    return appendSignedTweetMediaParams(normalizedUrl, expiresAt, signature);
  };
}

async function rewriteTweetMediaDetails(
  mediaDetails: Tweet["mediaDetails"],
  signTweetMediaUrl: TweetMediaProxySigner
): Promise<Tweet["mediaDetails"]> {
  if (!mediaDetails?.length) {
    return mediaDetails;
  }

  let changed = false;
  const rewrittenMediaDetails: NonNullable<Tweet["mediaDetails"]> = [];

  for (const media of mediaDetails) {
    if (!(media.type === "video" || media.type === "animated_gif")) {
      rewrittenMediaDetails.push(media);
      continue;
    }

    let variantsChanged = false;
    const rewrittenVariants: typeof media.video_info.variants = [];

    for (const variant of media.video_info.variants) {
      const nextUrl = await signTweetMediaUrl(variant.url);

      if (nextUrl !== variant.url) {
        variantsChanged = true;
      }

      rewrittenVariants.push(
        nextUrl === variant.url ? variant : { ...variant, url: nextUrl }
      );
    }

    if (!variantsChanged) {
      rewrittenMediaDetails.push(media);
      continue;
    }

    changed = true;
    rewrittenMediaDetails.push({
      ...media,
      video_info: {
        ...media.video_info,
        variants: rewrittenVariants,
      },
    });
  }

  return changed ? rewrittenMediaDetails : mediaDetails;
}

async function rewriteTweetVideo(
  video: Tweet["video"],
  signTweetMediaUrl: TweetMediaProxySigner
): Promise<Tweet["video"]> {
  if (!video?.variants?.length) {
    return video;
  }

  let changed = false;
  const rewrittenVariants: NonNullable<Tweet["video"]>["variants"] = [];

  for (const variant of video.variants) {
    const nextSrc = await signTweetMediaUrl(variant.src);

    if (nextSrc !== variant.src) {
      changed = true;
    }

    rewrittenVariants.push(
      nextSrc === variant.src ? variant : { ...variant, src: nextSrc }
    );
  }

  return changed ? { ...video, variants: rewrittenVariants } : video;
}

export async function rewriteTweetMediaUrls<T extends TweetMediaNode | null>(
  tweet: T,
  signTweetMediaUrl: TweetMediaProxySigner
): Promise<T> {
  if (!tweet) {
    return tweet;
  }

  const [mediaDetails, video, quotedTweet] = await Promise.all([
    rewriteTweetMediaDetails(tweet.mediaDetails, signTweetMediaUrl),
    rewriteTweetVideo(tweet.video, signTweetMediaUrl),
    tweet.quoted_tweet
      ? rewriteTweetMediaUrls(tweet.quoted_tweet, signTweetMediaUrl)
      : Promise.resolve(tweet.quoted_tweet),
  ]);

  if (
    mediaDetails === tweet.mediaDetails &&
    video === tweet.video &&
    quotedTweet === tweet.quoted_tweet
  ) {
    return tweet;
  }

  return {
    ...tweet,
    mediaDetails,
    video,
    quoted_tweet: quotedTweet,
  };
}

export async function verifyTweetMediaProxyRequest(
  request: Request,
  db: Database,
  configuredSecret?: string,
  nowMs = Date.now()
): Promise<URL | null> {
  const requestUrl = new URL(request.url);
  const mediaUrl = parseTweetMediaUrl(requestUrl.searchParams.get("url") ?? "");
  const expiresAtValue =
    requestUrl.searchParams.get(TWEET_MEDIA_PROXY_EXP_PARAM) ?? "";
  const signature =
    requestUrl.searchParams.get(TWEET_MEDIA_PROXY_SIGNATURE_PARAM) ?? "";

  if (!(mediaUrl && INTEGER_RE.test(expiresAtValue) && signature)) {
    return null;
  }

  const expiresAt = Number(expiresAtValue);
  if (!(Number.isSafeInteger(expiresAt) && expiresAt >= nowMs / 1000)) {
    return null;
  }

  const signingKey = await resolveConfiguredAdminSecretHash(
    db,
    configuredSecret
  );
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const expectedSignature = await createTweetMediaProxySignature(
    cryptoKey,
    encoder,
    mediaUrl.toString(),
    expiresAt
  );

  return timingSafeEqual(signature, expectedSignature) ? mediaUrl : null;
}
