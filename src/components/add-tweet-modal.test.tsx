import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AddTweetModal } from "./add-tweet-modal";

beforeAll(() => {
  cleanup();
});

afterEach(() => {
  cleanup();
});

const renderWithUser = (ui: React.ReactElement) => {
  return {
    user: userEvent.setup(),
    ...render(ui),
  };
};

describe("AddTweetModal", () => {
  it("renders when isOpen is true", () => {
    render(
      <AddTweetModal isOpen={true} onClose={vi.fn()} onSubmit={vi.fn()} />
    );

    expect(screen.getByText("Add Tweet Embed")).toBeInTheDocument();
    expect(screen.getByLabelText("Twitter Embed Code")).toBeInTheDocument();
    expect(screen.getByLabelText("Admin Secret")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add Tweet" })
    ).toBeInTheDocument();
  });

  it("does not render when isOpen is false", () => {
    render(
      <AddTweetModal isOpen={false} onClose={vi.fn()} onSubmit={vi.fn()} />
    );

    expect(screen.queryByText("Add Tweet Embed")).not.toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", async () => {
    const onClose = vi.fn();
    const { user } = renderWithUser(
      <AddTweetModal isOpen={true} onClose={onClose} onSubmit={vi.fn()} />
    );

    await user.click(screen.getByLabelText("Close modal"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onSubmit with embed HTML and admin secret when form is submitted", async () => {
    const onSubmit = vi.fn();
    const { user } = renderWithUser(
      <AddTweetModal isOpen={true} onClose={vi.fn()} onSubmit={onSubmit} />
    );

    const secretInput = screen.getByLabelText("Admin Secret");
    const textarea = screen.getByLabelText("Twitter Embed Code");
    const submitButton = screen.getByRole("button", { name: "Add Tweet" });

    await user.type(secretInput, "my-secret");
    await user.type(
      textarea,
      '<blockquote class="twitter-tweet">...</blockquote>'
    );
    await user.click(submitButton);

    expect(onSubmit).toHaveBeenCalledWith(
      '<blockquote class="twitter-tweet">...</blockquote>',
      "my-secret"
    );
  });

  it("shows loading state while submitting", async () => {
    const onSubmit = vi.fn(
      () => new Promise<void>((resolve) => setTimeout(resolve, 100))
    );
    const { user } = renderWithUser(
      <AddTweetModal isOpen={true} onClose={vi.fn()} onSubmit={onSubmit} />
    );

    await user.type(screen.getByLabelText("Admin Secret"), "secret");
    await user.type(screen.getByLabelText("Twitter Embed Code"), "test embed");
    await user.click(screen.getByRole("button", { name: "Add Tweet" }));

    expect(screen.getByText("Adding...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adding..." })).toBeDisabled();
  });

  it("displays error message when provided", () => {
    render(
      <AddTweetModal
        error="Failed to add tweet"
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByText("Failed to add tweet")).toBeInTheDocument();
  });

  it("disables submit button when fields are empty", () => {
    render(
      <AddTweetModal isOpen={true} onClose={vi.fn()} onSubmit={vi.fn()} />
    );

    const submitButton = screen.getByRole("button", { name: "Add Tweet" });
    expect(submitButton).toBeDisabled();
  });

  it("pre-fills admin secret from initialSecret when modal opens", () => {
    render(
      <AddTweetModal
        initialSecret="saved-secret"
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Admin Secret")).toHaveValue("saved-secret");
  });

  it("re-fills admin secret when modal reopens with initialSecret", async () => {
    const onClose = vi.fn();
    const { user, rerender } = renderWithUser(
      <AddTweetModal
        initialSecret="saved-secret"
        isOpen={true}
        onClose={onClose}
        onSubmit={vi.fn()}
      />
    );

    await user.click(screen.getByLabelText("Close modal"));

    rerender(
      <AddTweetModal
        initialSecret="saved-secret"
        isOpen={false}
        onClose={onClose}
        onSubmit={vi.fn()}
      />
    );

    rerender(
      <AddTweetModal
        initialSecret="saved-secret"
        isOpen={true}
        onClose={onClose}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Admin Secret")).toHaveValue("saved-secret");
  });

  it("preserves form values when submission fails", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("Unauthorized"));
    const { user } = renderWithUser(
      <AddTweetModal isOpen={true} onClose={vi.fn()} onSubmit={onSubmit} />
    );

    const secretInput = screen.getByLabelText("Admin Secret");
    const textarea = screen.getByLabelText("Twitter Embed Code");

    await user.type(secretInput, "wrong-secret");
    await user.type(textarea, "<blockquote>tweet</blockquote>");
    await user.click(screen.getByRole("button", { name: "Add Tweet" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(secretInput).toHaveValue("wrong-secret");
    expect(textarea).toHaveValue("<blockquote>tweet</blockquote>");
  });
});
