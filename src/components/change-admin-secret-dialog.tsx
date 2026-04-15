"use client";

import { AnimatePresence, motion } from "motion/react";
import { type SubmitEvent, useEffect, useMemo, useState } from "react";
import { cn } from "../lib/utils";
import { XIcon } from "./icons";

interface ChangeAdminSecretDialogProps {
  error?: string | null;
  isOpen: boolean;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (secret: string) => Promise<void> | void;
}

export function ChangeAdminSecretDialog({
  error,
  isOpen,
  isSubmitting,
  onClose,
  onSubmit,
}: ChangeAdminSecretDialogProps) {
  const [secretInput, setSecretInput] = useState("");
  const [confirmInput, setConfirmInput] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setSecretInput("");
      setConfirmInput("");
    }
  }, [isOpen]);

  const hasMismatch = useMemo(
    () => secretInput.length > 0 && secretInput !== confirmInput,
    [confirmInput, secretInput]
  );

  const handleClose = () => {
    if (isSubmitting) {
      return;
    }

    setSecretInput("");
    setConfirmInput("");
    onClose();
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!secretInput.trim() || hasMismatch || isSubmitting) {
      return;
    }

    await onSubmit(secretInput);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[60] bg-zinc-950/20 backdrop-blur-sm dark:bg-zinc-950/60"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={handleClose}
          />
          <motion.div
            animate={{ y: 0, opacity: 1 }}
            aria-labelledby="change-admin-secret-title"
            aria-modal={true}
            className="fixed inset-x-4 top-[14%] z-[70] mx-auto max-w-md overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
            exit={{ y: 20, opacity: 0 }}
            initial={{ y: 20, opacity: 0 }}
            role="dialog"
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-center justify-between border-zinc-100 border-b px-6 py-4 dark:border-zinc-800">
              <div>
                <h2
                  className="font-display font-semibold text-lg dark:text-zinc-50"
                  id="change-admin-secret-title"
                >
                  Change Admin Secret
                </h2>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Save a new admin secret without touching Cloudflare secrets.
                </p>
              </div>
              <button
                aria-label="Close change secret dialog"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                onClick={handleClose}
                type="button"
              >
                <XIcon aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>

            <form className="flex flex-col gap-4 p-6" onSubmit={handleSubmit}>
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 text-sm dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-200">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <label
                  className="font-medium text-sm text-zinc-700 dark:text-zinc-300"
                  htmlFor="new-admin-secret-input"
                >
                  New admin secret
                </label>
                <input
                  autoFocus
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm transition-all focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                  disabled={isSubmitting}
                  id="new-admin-secret-input"
                  maxLength={256}
                  onChange={(event) => setSecretInput(event.target.value)}
                  placeholder="Enter a new admin secret"
                  type="password"
                  value={secretInput}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label
                  className="font-medium text-sm text-zinc-700 dark:text-zinc-300"
                  htmlFor="confirm-admin-secret-input"
                >
                  Confirm new admin secret
                </label>
                <input
                  className={cn(
                    "w-full rounded-2xl border bg-white px-4 py-3 text-sm transition-all focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:bg-zinc-900 dark:text-zinc-100",
                    hasMismatch
                      ? "border-red-300 dark:border-red-700"
                      : "border-zinc-200 dark:border-zinc-800"
                  )}
                  disabled={isSubmitting}
                  id="confirm-admin-secret-input"
                  maxLength={256}
                  onChange={(event) => setConfirmInput(event.target.value)}
                  placeholder="Re-enter the new admin secret"
                  type="password"
                  value={confirmInput}
                />
                {hasMismatch && (
                  <p className="text-red-700 text-xs dark:text-red-300">
                    The two secrets must match.
                  </p>
                )}
              </div>

              <div className="mt-2 flex gap-3">
                <button
                  className="flex-1 rounded-full border border-zinc-200 bg-white px-6 py-3 font-medium text-sm text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  disabled={isSubmitting}
                  onClick={handleClose}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="flex-1 rounded-full bg-zinc-950 px-6 py-3 font-medium text-sm text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
                  disabled={!secretInput.trim() || hasMismatch || isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? "Saving..." : "Save secret"}
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
