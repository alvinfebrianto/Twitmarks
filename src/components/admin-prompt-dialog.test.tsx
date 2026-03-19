import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AdminPromptDialog } from "./admin-prompt-dialog";

beforeAll(() => {
  cleanup();
});

afterEach(() => {
  cleanup();
});

const renderWithUser = (ui: React.ReactElement) => ({
  user: userEvent.setup(),
  ...render(ui),
});

describe("AdminPromptDialog", () => {
  it("keeps the secret input while unlock is pending", async () => {
    let resolveUnlock: (() => void) | undefined;
    const onUnlock = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveUnlock = resolve;
        })
    );

    const { user } = renderWithUser(
      <AdminPromptDialog isOpen={true} onClose={vi.fn()} onUnlock={onUnlock} />
    );

    const input = screen.getByLabelText("Admin secret");
    await user.type(input, "test-secret");
    await user.click(screen.getByRole("button", { name: "Unlock" }));

    expect(onUnlock).toHaveBeenCalledWith("test-secret");
    expect(input).toHaveValue("test-secret");

    resolveUnlock?.();
  });

  it("clears input when dialog closes and reopens", async () => {
    const onClose = vi.fn();
    const onUnlock = vi.fn();
    const { user, rerender } = renderWithUser(
      <AdminPromptDialog isOpen={true} onClose={onClose} onUnlock={onUnlock} />
    );

    const input = screen.getByLabelText("Admin secret");
    await user.type(input, "test-secret");

    rerender(
      <AdminPromptDialog isOpen={false} onClose={onClose} onUnlock={onUnlock} />
    );
    rerender(
      <AdminPromptDialog isOpen={true} onClose={onClose} onUnlock={onUnlock} />
    );

    expect(screen.getByLabelText("Admin secret")).toHaveValue("");
  });
});
