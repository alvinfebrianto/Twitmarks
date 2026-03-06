"use client";

import { X } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { cn } from "../lib/utils";

interface AddTweetModalProps {
  error?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (embedHtml: string, adminSecret: string) => Promise<void> | void;
}

export function AddTweetModal({
  error,
  isOpen,
  onClose,
  onSubmit,
}: AddTweetModalProps) {
  const [embedHtml, setEmbedHtml] = useState("");
  const [adminSecret, setAdminSecret] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(embedHtml.trim() && adminSecret.trim()) || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(embedHtml.trim(), adminSecret.trim());
      setEmbedHtml("");
      setAdminSecret("");
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
    setEmbedHtml("");
    setAdminSecret("");
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
            className="fixed inset-x-4 top-[10%] z-[70] mx-auto max-w-lg overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
            exit={{ y: 20, opacity: 0 }}
            initial={{ y: 20, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
          >
            <div className="flex items-center justify-between border-zinc-100 border-b px-6 py-4 dark:border-zinc-800">
              <h2 className="font-display font-semibold text-xl dark:text-zinc-50">
                Add Tweet Embed
              </h2>
              <button
                aria-label="Close modal"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                onClick={handleClose}
                type="button"
              >
                <X aria-hidden="true" className="h-5 w-5" />
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
                  htmlFor="admin-secret"
                >
                  Admin Secret
                </label>
                <input
                  className={cn(
                    "w-full rounded-2xl border bg-white px-4 py-3 text-sm transition-all",
                    "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20",
                    "dark:bg-zinc-900 dark:text-zinc-100",
                    error
                      ? "border-red-300 dark:border-red-700"
                      : "border-zinc-200 dark:border-zinc-800"
                  )}
                  disabled={isSubmitting}
                  id="admin-secret"
                  onChange={(e) => setAdminSecret(e.target.value)}
                  placeholder="Enter admin secret"
                  required
                  type="password"
                  value={adminSecret}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label
                  className="font-medium text-sm text-zinc-700 dark:text-zinc-300"
                  htmlFor="embed-html"
                >
                  Twitter Embed Code
                </label>
                <textarea
                  aria-label="Twitter Embed Code"
                  className={cn(
                    "min-h-[160px] w-full rounded-2xl border bg-white p-4 font-mono text-sm transition-all",
                    "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20",
                    "dark:bg-zinc-900 dark:text-zinc-100",
                    error
                      ? "border-red-300 dark:border-red-700"
                      : "border-zinc-200 dark:border-zinc-800"
                  )}
                  disabled={isSubmitting}
                  id="embed-html"
                  onChange={(e) => setEmbedHtml(e.target.value)}
                  placeholder="Paste Twitter embed code here..."
                  required
                  value={embedHtml}
                />
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Paste the HTML embed code from Twitter&apos;s &quot;Embed
                  Tweet&quot; option.
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
                  disabled={
                    isSubmitting || !embedHtml.trim() || !adminSecret.trim()
                  }
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
