"use client";

import { AnimatePresence, motion } from "motion/react";
import { type SubmitEvent, useState } from "react";
import { cn } from "../lib/utils";
import { XIcon } from "./icons";

interface AddTweetModalProps {
  error?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (tweetUrl: string) => Promise<void> | void;
}

export function AddTweetModal({
  error,
  isOpen,
  onClose,
  onSubmit,
}: AddTweetModalProps) {
  const [tweetUrl, setTweetUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!tweetUrl.trim() || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(tweetUrl.trim());
      setTweetUrl("");
    } catch {
      // The parent surfaces submission errors; keep the current values for retry.
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (isSubmitting) {
      return;
    }
    setTweetUrl("");
    onClose();
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
            aria-labelledby="add-tweet-modal-title"
            aria-modal={true}
            className="fixed inset-x-4 top-[10%] z-[70] mx-auto max-w-lg overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
            exit={{ y: 20, opacity: 0 }}
            initial={{ y: 20, opacity: 0 }}
            role="dialog"
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-center justify-between border-zinc-100 border-b px-6 py-4 dark:border-zinc-800">
              <h2
                className="font-display font-semibold text-xl dark:text-zinc-50"
                id="add-tweet-modal-title"
              >
                Add Tweet URL
              </h2>
              <button
                aria-label="Close modal"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                onClick={handleClose}
                type="button"
              >
                <XIcon aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>

            <form className="flex flex-col gap-4 p-6" onSubmit={handleSubmit}>
              {error && (
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 text-sm dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-200"
                  initial={{ opacity: 0, y: -10 }}
                >
                  {error}
                </motion.div>
              )}

              <div className="flex flex-col gap-2">
                <label
                  className="font-medium text-sm text-zinc-700 dark:text-zinc-300"
                  htmlFor="embed-html"
                >
                  Tweet URL
                </label>
                <div className="relative">
                  <textarea
                    aria-label="Tweet URL"
                    className={cn(
                      "min-h-[160px] w-full rounded-2xl border bg-white py-4 pr-12 pl-4 font-mono text-sm transition-all",
                      "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20",
                      "dark:bg-zinc-900 dark:text-zinc-100",
                      error
                        ? "border-red-300 dark:border-red-700"
                        : "border-zinc-200 dark:border-zinc-800"
                    )}
                    disabled={isSubmitting}
                    id="embed-html"
                    onChange={(e) => setTweetUrl(e.target.value)}
                    placeholder="Paste an https://x.com/.../status/... URL here"
                    required
                    value={tweetUrl}
                  />
                  <AnimatePresence>
                    {tweetUrl && !isSubmitting && (
                      <motion.button
                        animate={{ opacity: 1, scale: 1 }}
                        aria-label="Clear tweet URL"
                        className="absolute top-4 right-4 flex items-center text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-200"
                        exit={{ opacity: 0, scale: 0.95 }}
                        initial={{ opacity: 0, scale: 0.95 }}
                        onClick={() => setTweetUrl("")}
                        type="button"
                      >
                        <XIcon
                          aria-hidden="true"
                          className="h-4 w-4"
                          weight="bold"
                        />
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Paste a public tweet URL from X or Twitter. Raw embed HTML is
                  no longer accepted.
                </p>
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
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 rounded-full px-6 py-3 font-medium text-sm transition-all",
                    isSubmitting
                      ? "cursor-not-allowed bg-zinc-400 text-white"
                      : "bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
                  )}
                  disabled={isSubmitting || !tweetUrl.trim()}
                  type="submit"
                >
                  {isSubmitting ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white dark:border-zinc-950/30 dark:border-t-zinc-950"
                        transition={{
                          duration: 1,
                          repeat: Number.POSITIVE_INFINITY,
                          ease: "linear",
                        }}
                      />
                      Adding...
                    </>
                  ) : (
                    "Add Tweet"
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
