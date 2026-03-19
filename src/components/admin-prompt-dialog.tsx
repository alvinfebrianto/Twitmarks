"use client";

import { X } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

interface AdminPromptDialogProps {
  error?: string | null;
  isOpen: boolean;
  isSubmitting?: boolean;
  onClose: () => void;
  onUnlock: (secret: string) => Promise<void> | void;
}

export function AdminPromptDialog({
  error,
  isOpen,
  isSubmitting,
  onClose,
  onUnlock,
}: AdminPromptDialogProps) {
  const [adminInput, setAdminInput] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setAdminInput("");
    }
  }, [isOpen]);

  const handleClose = () => {
    if (isSubmitting) {
      return;
    }
    setAdminInput("");
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUnlock(adminInput);
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
            aria-labelledby="admin-modal-title"
            aria-modal={true}
            className="fixed inset-x-4 top-[20%] z-[70] mx-auto max-w-sm overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
            exit={{ y: 20, opacity: 0 }}
            initial={{ y: 20, opacity: 0 }}
            role="dialog"
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-center justify-between border-zinc-100 border-b px-6 py-4 dark:border-zinc-800">
              <h2
                className="font-display font-semibold text-lg dark:text-zinc-50"
                id="admin-modal-title"
              >
                Admin Access
              </h2>
              <button
                aria-label="Close"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                onClick={handleClose}
                type="button"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            <form className="flex flex-col gap-4 p-6" onSubmit={handleSubmit}>
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 text-sm dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-200">
                  {error}
                </div>
              )}
              <div className="relative">
                <label className="sr-only" htmlFor="admin-secret-input">
                  Admin secret
                </label>
                <input
                  autoFocus
                  className="w-full rounded-2xl border border-zinc-200 bg-white py-3 pr-12 pl-4 text-sm transition-all focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                  disabled={isSubmitting}
                  id="admin-secret-input"
                  onChange={(e) => setAdminInput(e.target.value)}
                  placeholder="Enter admin secret"
                  type="password"
                  value={adminInput}
                />
                <AnimatePresence>
                  {adminInput && !isSubmitting && (
                    <motion.button
                      animate={{ opacity: 1, scale: 1 }}
                      aria-label="Clear secret"
                      className="absolute inset-y-0 right-4 flex items-center text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-200"
                      exit={{ opacity: 0, scale: 0.95 }}
                      initial={{ opacity: 0, scale: 0.95 }}
                      onClick={() => setAdminInput("")}
                      type="button"
                    >
                      <X aria-hidden="true" className="h-4 w-4" weight="bold" />
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
              <button
                className="w-full rounded-full bg-zinc-950 px-6 py-3 font-medium text-sm text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
                disabled={!adminInput.trim() || isSubmitting}
                type="submit"
              >
                {isSubmitting ? "Unlocking..." : "Unlock"}
              </button>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
