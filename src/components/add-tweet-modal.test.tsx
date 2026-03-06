import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { AddTweetModal } from "./add-tweet-modal";

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
});
