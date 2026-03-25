import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { DbTweet } from "../lib/tweet-helpers";

vi.mock("react-tweet", () => ({
  enrichTweet: vi.fn((tweet: unknown) => ({
    ...(tweet as object),
    entities: [],
    mediaDetails: [],
  })),
  getMediaUrl: vi.fn(() => ""),
  QuotedTweet: () => null,
  TweetBody: ({ tweet }: { tweet: { text: string } }) => (
    <p>{tweet?.text ?? ""}</p>
  ),
  TweetContainer: ({ children }: { children: React.ReactNode }) => (
    <article>{children}</article>
  ),
  TweetHeader: () => null,
  TweetInfo: () => null,
  TweetInReplyTo: () => null,
  TweetMedia: () => null,
  TweetNotFound: () => <div>Tweet not found</div>,
  TweetSkeleton: () => <div>Loading...</div>,
  useTweet: vi.fn(() => ({ isLoading: false, data: null, error: null })),
}));

const { default: App } = await import("./home-app");

beforeAll(() => {
  cleanup();
});

afterEach(() => {
  cleanup();
});

const DELETE_SELECTED_RE = /Delete .+ selected/;

describe("HomeApp types", () => {
  it("DbTweet matches the API response shape", () => {
    const apiResponse: DbTweet = {
      id: 1,
      embed_html:
        '<blockquote class="twitter-tweet"><p>Hello world</p></blockquote>',
      created_at: "2025-03-01T00:00:00Z",
      sort_order: 1,
    };

    expect(apiResponse.id).toBe(1);
    expect(apiResponse.embed_html).toContain("twitter-tweet");
    expect(apiResponse.created_at).toBeTruthy();
    expect(apiResponse.sort_order).toBe(1);
  });

  it("DbTweet array can be sorted by created_at", () => {
    const tweets: DbTweet[] = [
      {
        id: 1,
        embed_html: "<blockquote>old</blockquote>",
        created_at: "2025-01-01T00:00:00Z",
        sort_order: 1,
      },
      {
        id: 2,
        embed_html: "<blockquote>new</blockquote>",
        created_at: "2025-03-01T00:00:00Z",
        sort_order: 2,
      },
    ];

    const sorted = [...tweets].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    expect(sorted[0].id).toBe(2);
    expect(sorted[1].id).toBe(1);
  });

  it("DbTweet embed_html can be searched", () => {
    const tweets: DbTweet[] = [
      {
        id: 1,
        embed_html:
          '<blockquote class="twitter-tweet"><p>Hello world</p></blockquote>',
        created_at: "2025-03-01T00:00:00Z",
        sort_order: 1,
      },
      {
        id: 2,
        embed_html:
          '<blockquote class="twitter-tweet"><p>Goodbye moon</p></blockquote>',
        created_at: "2025-03-01T00:00:00Z",
        sort_order: 2,
      },
    ];

    const q = "hello";
    const filtered = tweets.filter((t) =>
      t.embed_html.toLowerCase().includes(q)
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(1);
  });
});

const renderWithUser = (ui: React.ReactElement) => ({
  user: userEvent.setup(),
  ...render(ui),
});

const MOCK_TWEETS: DbTweet[] = [
  {
    id: 1,
    embed_html:
      '<blockquote class="twitter-tweet"><p lang="en">First tweet content</p></blockquote>',
    created_at: "2025-03-01T00:00:00Z",
    sort_order: 1,
  },
  {
    id: 2,
    embed_html:
      '<blockquote class="twitter-tweet"><p lang="en">Second tweet content</p></blockquote>',
    created_at: "2025-03-02T00:00:00Z",
    sort_order: 2,
  },
];

describe("admin-gated UI elements", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("add button is not visible without admin", () => {
    render(<App initialTweets={MOCK_TWEETS} />);
    expect(
      screen.queryByRole("button", { name: "Add new tweet" })
    ).not.toBeInTheDocument();
  });

  it("add button is visible when admin is unlocked", () => {
    render(<App initialIsAdmin={true} initialTweets={MOCK_TWEETS} />);
    expect(
      screen.getByRole("button", { name: "Add new tweet" })
    ).toBeInTheDocument();
  });

  it("select button is not visible without admin", () => {
    render(<App initialTweets={MOCK_TWEETS} />);
    expect(
      screen.queryByRole("button", { name: "Select tweets" })
    ).not.toBeInTheDocument();
  });

  it("select button is visible when admin is unlocked", () => {
    render(<App initialIsAdmin={true} initialTweets={MOCK_TWEETS} />);
    expect(
      screen.getByRole("button", { name: "Select tweets" })
    ).toBeInTheDocument();
  });

  it("empty state copy for non-admin does not reference add button", () => {
    render(<App initialTweets={[]} />);
    expect(
      screen.getByText("No tweet embeds have been added yet.")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Add your first tweet embed using the button above.")
    ).not.toBeInTheDocument();
  });

  it("empty state copy for admin references add button", () => {
    render(<App initialIsAdmin={true} initialTweets={[]} />);
    expect(
      screen.getByText("Add your first tweet embed using the button above.")
    ).toBeInTheDocument();
  });
});

describe("multi-select deletion", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("entering selection mode shows checkboxes for each tweet", async () => {
    const { user } = renderWithUser(
      <App initialIsAdmin={true} initialTweets={MOCK_TWEETS} />
    );
    await user.click(screen.getByRole("button", { name: "Select tweets" }));
    expect(
      screen.getByRole("checkbox", { name: "Select tweet 1" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Select tweet 2" })
    ).toBeInTheDocument();
  });

  it("clicking a checkbox selects the tweet and shows bulk action bar", async () => {
    const { user } = renderWithUser(
      <App initialIsAdmin={true} initialTweets={MOCK_TWEETS} />
    );
    await user.click(screen.getByRole("button", { name: "Select tweets" }));
    await user.click(screen.getByRole("checkbox", { name: "Select tweet 1" }));
    expect(
      screen.getByRole("button", { name: "Delete 1 selected tweet" })
    ).toBeInTheDocument();
    expect(screen.getByText("Delete 1 tweet")).toBeInTheDocument();
  });

  it("clicking a selected checkbox deselects it and hides the bar", async () => {
    const { user } = renderWithUser(
      <App initialIsAdmin={true} initialTweets={MOCK_TWEETS} />
    );
    await user.click(screen.getByRole("button", { name: "Select tweets" }));
    await user.click(screen.getByRole("checkbox", { name: "Select tweet 1" }));
    await user.click(screen.getByRole("checkbox", { name: "Select tweet 1" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: DELETE_SELECTED_RE })
      ).not.toBeInTheDocument();
    });
  });

  it("select all selects all visible tweets", async () => {
    const { user } = renderWithUser(
      <App initialIsAdmin={true} initialTweets={MOCK_TWEETS} />
    );
    await user.click(screen.getByRole("button", { name: "Select tweets" }));
    await user.click(screen.getByRole("checkbox", { name: "Select tweet 1" }));
    await user.click(screen.getByRole("button", { name: "Select all 2" }));
    expect(
      screen.getByRole("button", { name: "Delete 2 selected tweets" })
    ).toBeInTheDocument();
  });

  it("bulk delete removes selected tweets optimistically", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 })
    );
    const { container, user } = renderWithUser(
      <App initialIsAdmin={true} initialTweets={MOCK_TWEETS} />
    );
    await user.click(screen.getByRole("button", { name: "Select tweets" }));
    await user.click(screen.getByRole("checkbox", { name: "Select tweet 1" }));
    await user.click(
      screen.getByRole("button", { name: "Delete 1 selected tweet" })
    );
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("checkbox", { name: "Select tweet 1" })
      ).not.toBeInTheDocument();
      expect(container.querySelectorAll(".tweet-embed")).toHaveLength(1);
    });
  });

  it("bulk delete rolls back tweets and shows error on server failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 })
    );
    const { container, user } = renderWithUser(
      <App initialIsAdmin={true} initialTweets={MOCK_TWEETS} />
    );
    await user.click(screen.getByRole("button", { name: "Select tweets" }));
    await user.click(screen.getByRole("checkbox", { name: "Select tweet 1" }));
    await user.click(
      screen.getByRole("button", { name: "Delete 1 selected tweet" })
    );
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => {
      expect(container.querySelectorAll(".tweet-embed")).toHaveLength(2);
      expect(
        screen.getByText("Failed to delete 1 tweet. Please try again.")
      ).toBeInTheDocument();
    });
  });

  it("bulk delete locks admin and restores tweet on 401 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401 })
    );
    const { container, user } = renderWithUser(
      <App initialIsAdmin={true} initialTweets={MOCK_TWEETS} />
    );
    await user.click(screen.getByRole("button", { name: "Select tweets" }));
    await user.click(screen.getByRole("checkbox", { name: "Select tweet 1" }));
    await user.click(
      screen.getByRole("button", { name: "Delete 1 selected tweet" })
    );
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => {
      expect(container.querySelectorAll(".tweet-embed")).toHaveLength(2);
      expect(
        screen.getByText("Admin session expired. Please unlock again.")
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: "Select tweets" })
    ).not.toBeInTheDocument();
  });

  it("filter-driven prune resets confirmation state so bar reopens in default state", async () => {
    const { user } = renderWithUser(
      <App initialIsAdmin={true} initialTweets={MOCK_TWEETS} />
    );
    await user.click(screen.getByRole("button", { name: "Select tweets" }));
    await user.click(screen.getByRole("checkbox", { name: "Select tweet 1" }));
    await user.click(
      screen.getByRole("button", { name: "Delete 1 selected tweet" })
    );
    await user.click(screen.getByRole("button", { name: "Open filters" }));
    await user.type(
      screen.getByRole("textbox", { name: "Search tweets" }),
      "Second"
    );
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: DELETE_SELECTED_RE })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Confirm" })
      ).not.toBeInTheDocument();
    });
    await user.clear(screen.getByRole("textbox", { name: "Search tweets" }));
    await user.click(screen.getByRole("button", { name: "Close filters" }));
    await user.click(screen.getByRole("checkbox", { name: "Select tweet 1" }));
    expect(
      screen.getByRole("button", { name: "Delete 1 selected tweet" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Confirm" })
    ).not.toBeInTheDocument();
  });

  it("select all button is disabled when all tweets are selected", async () => {
    const { user } = renderWithUser(
      <App initialIsAdmin={true} initialTweets={MOCK_TWEETS} />
    );
    await user.click(screen.getByRole("button", { name: "Select tweets" }));
    await user.click(screen.getByRole("checkbox", { name: "Select tweet 1" }));
    await user.click(screen.getByRole("button", { name: "Select all 2" }));
    expect(screen.getByRole("button", { name: "Select all 2" })).toBeDisabled();
  });

  it("bulk delete shows combined error when failures include both 401 and non-401", async () => {
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ ok: false, status: 401 });
        }
        return Promise.resolve({ ok: false, status: 500 });
      })
    );
    const { user } = renderWithUser(
      <App initialIsAdmin={true} initialTweets={MOCK_TWEETS} />
    );
    await user.click(screen.getByRole("button", { name: "Select tweets" }));
    await user.click(screen.getByRole("checkbox", { name: "Select tweet 1" }));
    await user.click(screen.getByRole("button", { name: "Select all 2" }));
    await user.click(
      screen.getByRole("button", { name: "Delete 2 selected tweets" })
    );
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => {
      expect(
        screen.getByText(
          "Admin session expired. Please unlock again. Additionally, 1 tweet could not be deleted."
        )
      ).toBeInTheDocument();
    });
  });

  it("cancelling selection mode resets all state", async () => {
    const { user } = renderWithUser(
      <App initialIsAdmin={true} initialTweets={MOCK_TWEETS} />
    );
    await user.click(screen.getByRole("button", { name: "Select tweets" }));
    await user.click(screen.getByRole("checkbox", { name: "Select tweet 1" }));
    await user.click(screen.getByRole("button", { name: "Cancel selection" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("checkbox", { name: "Select tweet 1" })
      ).not.toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: DELETE_SELECTED_RE })
    ).not.toBeInTheDocument();
  });

  it("bulk delete sends correct tweet IDs to the delete endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    const { user } = renderWithUser(
      <App initialIsAdmin={true} initialTweets={MOCK_TWEETS} />
    );
    await user.click(screen.getByRole("button", { name: "Select tweets" }));
    await user.click(screen.getByRole("checkbox", { name: "Select tweet 1" }));
    await user.click(
      screen.getByRole("button", { name: "Delete 1 selected tweet" })
    );
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tweets",
        expect.objectContaining({
          method: "DELETE",
          body: JSON.stringify({ id: 1 }),
        })
      );
    });
  });

  it("partial filter-prune keeps confirming state and updates count for remaining selected tweets", async () => {
    const { user } = renderWithUser(
      <App initialIsAdmin={true} initialTweets={MOCK_TWEETS} />
    );
    await user.click(screen.getByRole("button", { name: "Select tweets" }));
    await user.click(screen.getByRole("checkbox", { name: "Select tweet 1" }));
    await user.click(screen.getByRole("button", { name: "Select all 2" }));
    await user.click(
      screen.getByRole("button", { name: "Delete 2 selected tweets" })
    );
    await user.click(screen.getByRole("button", { name: "Open filters" }));
    await user.type(
      screen.getByRole("textbox", { name: "Search tweets" }),
      "Second"
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Confirm" })
      ).toBeInTheDocument();
      expect(screen.getByText("Delete 1 tweet?")).toBeInTheDocument();
    });
  });
});

describe("Admin prompt dialog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("clears admin error when closed via Escape", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: vi.fn().mockResolvedValue({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { user } = renderWithUser(<App initialTweets={MOCK_TWEETS} />);
    await user.click(screen.getByRole("button", { name: "Unlock admin" }));
    await user.type(screen.getByLabelText("Admin secret"), "bad-secret");
    await user.click(screen.getByRole("button", { name: "Unlock" }));

    await waitFor(() => {
      expect(screen.getByText("Invalid admin secret.")).toBeInTheDocument();
    });

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Admin Access" })
      ).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Unlock admin" }));

    expect(screen.queryByText("Invalid admin secret.")).not.toBeInTheDocument();
  });
});
