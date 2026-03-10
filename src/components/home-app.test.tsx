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
import App, { type DbTweet } from "./home-app";

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

describe("multi-select deletion", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("select button is not visible without admin", () => {
    render(<App initialTweets={MOCK_TWEETS} />);
    expect(
      screen.queryByRole("button", { name: "Select tweets" })
    ).not.toBeInTheDocument();
  });

  it("select button is visible when admin is unlocked", () => {
    sessionStorage.setItem("twitmarks_admin", "test-secret");
    render(<App initialTweets={MOCK_TWEETS} />);
    expect(
      screen.getByRole("button", { name: "Select tweets" })
    ).toBeInTheDocument();
  });

  it("entering selection mode shows checkboxes for each tweet", async () => {
    sessionStorage.setItem("twitmarks_admin", "test-secret");
    const { user } = renderWithUser(<App initialTweets={MOCK_TWEETS} />);
    await user.click(screen.getByRole("button", { name: "Select tweets" }));
    expect(
      screen.getByRole("checkbox", { name: "Select tweet 1" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Select tweet 2" })
    ).toBeInTheDocument();
  });

  it("clicking a checkbox selects the tweet and shows bulk action bar", async () => {
    sessionStorage.setItem("twitmarks_admin", "test-secret");
    const { user } = renderWithUser(<App initialTweets={MOCK_TWEETS} />);
    await user.click(screen.getByRole("button", { name: "Select tweets" }));
    await user.click(screen.getByRole("checkbox", { name: "Select tweet 1" }));
    expect(
      screen.getByRole("button", { name: "Delete 1 selected tweet" })
    ).toBeInTheDocument();
  });

  it("clicking a selected checkbox deselects it and hides the bar", async () => {
    sessionStorage.setItem("twitmarks_admin", "test-secret");
    const { user } = renderWithUser(<App initialTweets={MOCK_TWEETS} />);
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
    sessionStorage.setItem("twitmarks_admin", "test-secret");
    const { user } = renderWithUser(<App initialTweets={MOCK_TWEETS} />);
    await user.click(screen.getByRole("button", { name: "Select tweets" }));
    await user.click(screen.getByRole("checkbox", { name: "Select tweet 1" }));
    await user.click(screen.getByRole("button", { name: "Select all 2" }));
    expect(
      screen.getByRole("button", { name: "Delete 2 selected tweets" })
    ).toBeInTheDocument();
  });

  it("bulk delete removes selected tweets optimistically", async () => {
    sessionStorage.setItem("twitmarks_admin", "test-secret");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 })
    );
    const { user } = renderWithUser(<App initialTweets={MOCK_TWEETS} />);
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
    });
    expect(screen.getByText("Second tweet content")).toBeInTheDocument();
  });

  it("bulk delete rolls back tweets and shows error on server failure", async () => {
    sessionStorage.setItem("twitmarks_admin", "test-secret");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 })
    );
    const { user } = renderWithUser(<App initialTweets={MOCK_TWEETS} />);
    await user.click(screen.getByRole("button", { name: "Select tweets" }));
    await user.click(screen.getByRole("checkbox", { name: "Select tweet 1" }));
    await user.click(
      screen.getByRole("button", { name: "Delete 1 selected tweet" })
    );
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => {
      expect(screen.getByText("First tweet content")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Failed to delete 1 tweet. Please try again.")
    ).toBeInTheDocument();
  });

  it("bulk delete locks admin and restores tweet on 401 response", async () => {
    sessionStorage.setItem("twitmarks_admin", "test-secret");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401 })
    );
    const { user } = renderWithUser(<App initialTweets={MOCK_TWEETS} />);
    await user.click(screen.getByRole("button", { name: "Select tweets" }));
    await user.click(screen.getByRole("checkbox", { name: "Select tweet 1" }));
    await user.click(
      screen.getByRole("button", { name: "Delete 1 selected tweet" })
    );
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => {
      expect(screen.getByText("First tweet content")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Admin session expired. Please unlock again.")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Select tweets" })
    ).not.toBeInTheDocument();
  });

  it("filter-driven prune resets confirmation state so bar reopens in default state", async () => {
    sessionStorage.setItem("twitmarks_admin", "test-secret");
    const { user } = renderWithUser(<App initialTweets={MOCK_TWEETS} />);
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
    sessionStorage.setItem("twitmarks_admin", "test-secret");
    const { user } = renderWithUser(<App initialTweets={MOCK_TWEETS} />);
    await user.click(screen.getByRole("button", { name: "Select tweets" }));
    await user.click(screen.getByRole("checkbox", { name: "Select tweet 1" }));
    await user.click(screen.getByRole("button", { name: "Select all 2" }));
    expect(screen.getByRole("button", { name: "Select all 2" })).toBeDisabled();
  });

  it("bulk delete shows combined error when failures include both 401 and non-401", async () => {
    sessionStorage.setItem("twitmarks_admin", "test-secret");
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
    const { user } = renderWithUser(<App initialTweets={MOCK_TWEETS} />);
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
    sessionStorage.setItem("twitmarks_admin", "test-secret");
    const { user } = renderWithUser(<App initialTweets={MOCK_TWEETS} />);
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
});
