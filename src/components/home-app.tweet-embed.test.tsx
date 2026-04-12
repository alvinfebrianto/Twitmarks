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
    useTweet: () => ({ data: undefined, error: undefined, isLoading: false }),
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
    let resolveFetch: (value: unknown) => void;
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
