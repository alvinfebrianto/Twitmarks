import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomEmbeddedTweet, TweetUrlCard } from "./home-app";

const READ_REPLIES_RE = /Read \d+ replies/i;

vi.mock("react-tweet", async () => {
  const React = await import("react");

  interface MaybeChildrenProps {
    children?: React.ReactNode;
  }
  interface TweetChildProps {
    tweet: { text: string };
  }
  interface QuotedTweetProps {
    tweet: { text: string };
  }
  interface ReplyProps {
    tweet: { in_reply_to_status_id_str?: string };
  }
  interface TweetMediaProps {
    tweet: { mediaDetails?: unknown[] };
  }

  const TweetContainer = ({ children }: MaybeChildrenProps) => (
    <article>{children}</article>
  );
  const TweetHeader = (_props: TweetChildProps) => <div>header</div>;
  const TweetInReplyTo = ({ tweet }: ReplyProps) =>
    tweet.in_reply_to_status_id_str ? <div>in-reply</div> : null;
  const TweetBody = ({ tweet }: TweetChildProps) => <div>{tweet.text}</div>;
  const TweetMedia = ({ tweet }: TweetMediaProps) =>
    tweet.mediaDetails?.length ? <div>media</div> : null;
  const QuotedTweet = ({ tweet }: QuotedTweetProps) => <div>{tweet.text}</div>;
  const TweetInfo = (_props: TweetChildProps) => <div>info</div>;
  const TweetActions = (_props: TweetChildProps) => (
    <div>
      <span>Like</span>
      <span>Reply</span>
      <button type="button">Copy link</button>
    </div>
  );
  const TweetReplies = (_props: TweetChildProps) => <div>Read 8 replies</div>;
  const TweetNotFound = () => <div>not-found</div>;
  const TweetSkeleton = () => <div>loading</div>;
  const enrichTweet = <
    T extends {
      user: { screen_name: string };
    },
  >(
    tweet: T
  ) =>
    ({
      ...tweet,
      url: "https://x.com/tester/status/1000000000000000000",
      user: {
        ...tweet.user,
        follow_url: "https://x.com/intent/follow?screen_name=tester",
      },
      like_url: "https://x.com/intent/like?tweet_id=1000000000000000000",
      reply_url: "https://x.com/intent/tweet?in_reply_to=1000000000000000000",
      entities: [],
    }) as const;

  return {
    enrichTweet,
    getMediaUrl: () => "",
    QuotedTweet,
    TweetActions,
    TweetBody,
    TweetContainer,
    TweetHeader,
    TweetInfo,
    TweetInReplyTo,
    TweetMedia,
    TweetNotFound,
    TweetReplies,
    TweetSkeleton,
    useTweet: vi.fn(() => ({ data: null, error: null, isLoading: false })),
  };
});

afterEach(() => {
  cleanup();
});

describe("CustomEmbeddedTweet", () => {
  it("does not render tweet action controls or replies link", () => {
    render(
      <CustomEmbeddedTweet
        tweet={
          {
            __typename: "Tweet",
            id_str: "1000000000000000000",
            lang: "en",
            created_at: "2025-03-01T00:00:00Z",
            display_text_range: [0, 11],
            text: "Hello world",
            entities: {
              hashtags: [],
              urls: [],
              user_mentions: [],
              symbols: [],
            },
            user: {
              id_str: "1",
              name: "Tester",
              profile_image_url_https: "",
              profile_image_shape: "Circle",
              screen_name: "tester",
              verified: false,
              is_blue_verified: false,
            },
            edit_control: {
              edit_tweet_ids: ["1000000000000000000"],
              editable_until_msecs: "0",
              is_edit_eligible: false,
              edits_remaining: "0",
            },
            isEdited: false,
            isStaleEdit: false,
            favorite_count: 0,
            conversation_count: 8,
            news_action_type: "conversation",
          } as const
        }
      />
    );

    expect(screen.queryByText("Like")).not.toBeInTheDocument();
    expect(screen.queryByText("Reply")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Copy link" })
    ).not.toBeInTheDocument();
    expect(screen.queryByText(READ_REPLIES_RE)).not.toBeInTheDocument();
  });

  it("renders a playable inline video through the tweet media proxy using the lowest bitrate mp4", () => {
    const { container } = render(
      <CustomEmbeddedTweet
        tweet={
          {
            __typename: "Tweet",
            id_str: "2044772304006377836",
            lang: "en",
            created_at: "2026-04-16T13:38:01.000Z",
            display_text_range: [0, 149],
            text: "Video tweet",
            entities: {
              hashtags: [],
              urls: [],
              user_mentions: [],
              symbols: [],
              media: [
                {
                  display_url: "pic.x.com/qg1AM1B4dS",
                  expanded_url:
                    "https://x.com/cavalry__app/status/2044772304006377836/video/1",
                  indices: [126, 149],
                  url: "https://t.co/qg1AM1B4dS",
                },
              ],
            },
            user: {
              id_str: "1073199411348553729",
              name: "Cavalry",
              profile_image_url_https: "",
              profile_image_shape: "Circle",
              screen_name: "cavalry__app",
              verified: false,
              is_blue_verified: false,
            },
            edit_control: {
              edit_tweet_ids: ["2044772304006377836"],
              editable_until_msecs: "0",
              is_edit_eligible: false,
              edits_remaining: "0",
            },
            isEdited: false,
            isStaleEdit: false,
            favorite_count: 0,
            conversation_count: 0,
            news_action_type: "conversation",
            mediaDetails: [
              {
                display_url: "pic.x.com/qg1AM1B4dS",
                expanded_url:
                  "https://x.com/cavalry__app/status/2044772304006377836/video/1",
                ext_media_availability: { status: "Available" },
                indices: [126, 149],
                media_url_https:
                  "https://pbs.twimg.com/amplify_video_thumb/2044772239510511616/img/SHO3N6631slhS7_H.jpg",
                original_info: {
                  height: 900,
                  width: 720,
                  focus_rects: [],
                },
                sizes: {
                  large: { h: 900, resize: "fit", w: 720 },
                  medium: { h: 900, resize: "fit", w: 720 },
                  small: { h: 680, resize: "fit", w: 544 },
                  thumb: { h: 150, resize: "crop", w: 150 },
                },
                type: "video",
                url: "https://t.co/qg1AM1B4dS",
                video_info: {
                  aspect_ratio: [4, 5],
                  duration_millis: 23_416,
                  variants: [
                    {
                      content_type: "application/x-mpegURL",
                      url: "https://video.twimg.com/amplify_video/2044772239510511616/pl/gsNGyUIFfXHrQ3sL.m3u8?v=cfc",
                    },
                    {
                      bitrate: 632_000,
                      content_type: "video/mp4",
                      url: "https://video.twimg.com/amplify_video/2044772239510511616/vid/avc1/320x400/U5ek2JkYUjleV-qm.mp4",
                    },
                    {
                      bitrate: 950_000,
                      content_type: "video/mp4",
                      url: "https://video.twimg.com/amplify_video/2044772239510511616/vid/avc1/480x600/6nv_EYIeV3EYqWQf.mp4",
                    },
                    {
                      bitrate: 2_176_000,
                      content_type: "video/mp4",
                      url: "https://video.twimg.com/amplify_video/2044772239510511616/vid/avc1/720x900/1L4QMvB8e1UwdQ-i.mp4",
                    },
                  ],
                },
              },
            ],
          } as unknown as Parameters<typeof CustomEmbeddedTweet>[0]["tweet"]
        }
      />
    );

    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute("controls");

    const source = video?.querySelector("source");
    expect(source).not.toBeNull();
    expect(source).toHaveAttribute(
      "src",
      "/api/tweet/media?url=https%3A%2F%2Fvideo.twimg.com%2Famplify_video%2F2044772239510511616%2Fvid%2Favc1%2F320x400%2FU5ek2JkYUjleV-qm.mp4"
    );
  });

  it("renders tweet card metadata without fetching OG data again", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    render(
      <CustomEmbeddedTweet
        tweet={
          {
            __typename: "Tweet",
            id_str: "2027442150221201629",
            lang: "en",
            created_at: "2026-02-27T17:54:11.000Z",
            display_text_range: [0, 24],
            text: "Cloudflare tweet preview",
            card: {
              url: "https://t.co/C0KSqu6ruf",
              binding_values: {
                card_url: {
                  string_value: "https://t.co/C0KSqu6ruf",
                },
                description: {
                  string_value:
                    "A curated showcase of the best apps built on Cloudflare Workers",
                },
                domain: { string_value: "garden.cloudflare.dev" },
                summary_photo_image: {
                  image_value: {
                    url: "https://pbs.twimg.com/card_img/example.jpg",
                  },
                },
                title: { string_value: "Small App Garden" },
              },
            },
            user: {
              id_str: "1",
              name: "Cloudflare Developers",
              profile_image_url_https: "",
              profile_image_shape: "Circle",
              screen_name: "CloudflareDev",
              verified: false,
              is_blue_verified: false,
            },
            edit_control: {
              edit_tweet_ids: ["2027442150221201629"],
              editable_until_msecs: "0",
              is_edit_eligible: false,
              edits_remaining: "0",
            },
            isEdited: false,
            isStaleEdit: false,
            favorite_count: 0,
            conversation_count: 0,
            news_action_type: "conversation",
          } as unknown as Parameters<typeof CustomEmbeddedTweet>[0]["tweet"]
        }
      />
    );

    expect(screen.getByText("Small App Garden")).toBeInTheDocument();
    expect(screen.getByText("garden.cloudflare.dev")).toBeInTheDocument();
    expect(
      screen.getByText(
        "A curated showcase of the best apps built on Cloudflare Workers"
      )
    ).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("TweetUrlCard", () => {
  it("clears stale og state when initialOg transitions from truthy to null", () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const ogData = {
      title: "Stale Title",
      domain: "stale.dev",
      description: "Stale description",
      image: null,
    };

    const { rerender } = render(
      <TweetUrlCard initialOg={ogData} url="https://example.com" />
    );

    expect(screen.getByText("Stale Title")).toBeInTheDocument();

    rerender(<TweetUrlCard initialOg={null} url="https://example.com" />);

    expect(screen.queryByText("Stale Title")).not.toBeInTheDocument();
  });

  it("does not overwrite initialOg when a stale fetch completes after initialOg becomes truthy", async () => {
    let resolveFetch: ((value: unknown) => void) | undefined;
    new Promise((resolve) => {
      resolveFetch = resolve;
    });

    const fetchSpy = vi.fn().mockReturnValue({
      ok: true,
      json: () =>
        Promise.resolve({
          title: "Fetched Title",
          domain: "fetched.dev",
          description: null,
          image: null,
        }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    // Render with initialOg=null so the fetch starts
    const { rerender } = render(
      <TweetUrlCard initialOg={null} url="https://example.com" />
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Before the fetch completes, transition initialOg to a truthy value
    const ogData = {
      title: "Card Title",
      domain: "card.dev",
      description: null,
      image: null,
    };

    rerender(<TweetUrlCard initialOg={ogData} url="https://example.com" />);

    expect(screen.getByText("Card Title")).toBeInTheDocument();

    // Now resolve the stale fetch
    resolveFetch?.(undefined);

    // Wait for any pending state updates to flush
    await new Promise((r) => setTimeout(r, 0));

    // The stale fetch result must NOT overwrite the initialOg data
    expect(screen.getByText("Card Title")).toBeInTheDocument();
    expect(screen.queryByText("Fetched Title")).not.toBeInTheDocument();
  });
});
