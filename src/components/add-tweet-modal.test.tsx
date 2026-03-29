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

    expect(screen.getByText("Add Tweet URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Tweet URL")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add Tweet" })
    ).toBeInTheDocument();
  });

  it("does not render when isOpen is false", () => {
    render(
      <AddTweetModal isOpen={false} onClose={vi.fn()} onSubmit={vi.fn()} />
    );

    expect(screen.queryByText("Add Tweet URL")).not.toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", async () => {
    const onClose = vi.fn();
    const { user } = renderWithUser(
      <AddTweetModal isOpen={true} onClose={onClose} onSubmit={vi.fn()} />
    );

    await user.click(screen.getByLabelText("Close modal"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onSubmit with the tweet URL when form is submitted", async () => {
    const onSubmit = vi.fn();
    const { user } = renderWithUser(
      <AddTweetModal isOpen={true} onClose={vi.fn()} onSubmit={onSubmit} />
    );

    const textarea = screen.getByLabelText("Tweet URL");
    const submitButton = screen.getByRole("button", { name: "Add Tweet" });

    await user.type(textarea, "https://x.com/user/status/123");
    await user.click(submitButton);

    expect(onSubmit).toHaveBeenCalledWith("https://x.com/user/status/123");
  });

  it("shows loading state while submitting", async () => {
    const onSubmit = vi.fn(
      () => new Promise<void>((resolve) => setTimeout(resolve, 100))
    );
    const { user } = renderWithUser(
      <AddTweetModal isOpen={true} onClose={vi.fn()} onSubmit={onSubmit} />
    );

    await user.type(
      screen.getByLabelText("Tweet URL"),
      "https://x.com/user/status/123"
    );
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

  it("preserves form values when submission fails", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("Unauthorized"));
    const { user } = renderWithUser(
      <AddTweetModal isOpen={true} onClose={vi.fn()} onSubmit={onSubmit} />
    );

    const textarea = screen.getByLabelText("Tweet URL");

    await user.type(textarea, "https://x.com/user/status/123");
    await user.click(screen.getByRole("button", { name: "Add Tweet" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(textarea).toHaveValue("https://x.com/user/status/123");
  });
});
