"use client";

import { Trash } from "@phosphor-icons/react";
import { motion } from "motion/react";

interface BulkActionBarProps {
  isConfirming: boolean;
  onCancelConfirm: () => void;
  onConfirm: () => void;
  onRequestDelete: () => void;
  onSelectAll: () => void;
  selectedCount: number;
  totalCount: number;
}

export function BulkActionBar({
  isConfirming,
  onCancelConfirm,
  onConfirm,
  onRequestDelete,
  onSelectAll,
  selectedCount,
  totalCount,
}: BulkActionBarProps) {
  const label = `${selectedCount} tweet${selectedCount !== 1 ? "s" : ""}`;
  return (
    <motion.div
      animate={{ y: 0, opacity: 1 }}
      className="fixed inset-x-4 bottom-8 z-50 mx-auto max-w-sm"
      exit={{ y: 20, opacity: 0 }}
      initial={{ y: 20, opacity: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="glass-panel flex items-center justify-between gap-3 rounded-2xl px-5 py-3.5 dark:border dark:border-zinc-700/50">
        {isConfirming ? (
          <>
            <span className="font-medium text-sm text-zinc-700 dark:text-zinc-300">
              Delete {label}?
            </span>
            <div className="flex gap-2">
              <button
                className="rounded-full bg-zinc-100 px-3 py-1.5 font-medium text-xs text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                onClick={onCancelConfirm}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-full bg-red-600 px-3 py-1.5 font-medium text-white text-xs shadow-sm transition-colors hover:bg-red-700 active:scale-[0.98]"
                onClick={onConfirm}
                type="button"
              >
                Confirm
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-accent px-2 py-0.5 font-medium text-white text-xs">
                {selectedCount}
              </span>
              <span className="font-medium text-sm text-zinc-700 dark:text-zinc-300">
                selected
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                aria-label={`Select all ${totalCount}`}
                className="font-medium text-accent text-xs transition-colors hover:text-accent/80 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={selectedCount === totalCount}
                onClick={onSelectAll}
                type="button"
              >
                Select all {totalCount}
              </button>
              <button
                aria-label={`Delete ${selectedCount} selected tweet${selectedCount !== 1 ? "s" : ""}`}
                className="flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1.5 font-medium text-white text-xs shadow-sm transition-colors hover:bg-red-700 active:scale-[0.98]"
                onClick={onRequestDelete}
                type="button"
              >
                <Trash
                  aria-hidden="true"
                  className="h-3.5 w-3.5"
                  weight="bold"
                />
                <span>
                  Delete {selectedCount} tweet{selectedCount !== 1 ? "s" : ""}
                </span>
              </button>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}
