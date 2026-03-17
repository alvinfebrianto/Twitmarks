"use client";

import {
  ArrowUp,
  MagnifyingGlass,
  SortAscending,
  SortDescending,
  X,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "../lib/utils";

const SORTS = ["Manual", "Newest", "Oldest"];
const DATES = ["All Time", "Last 7 Days", "Last 30 Days"];

interface FilterDrawerProps {
  dateFilter: string;
  filteredCount: number;
  isAdmin: boolean;
  isOpen: boolean;
  onClose: () => void;
  onDateFilterChange: (value: string) => void;
  onSearchQueryChange: (value: string) => void;
  onSortOptionChange: (value: string) => void;
  searchQuery: string;
  sortOption: string;
  totalCount: number;
}

export function FilterDrawer({
  dateFilter,
  filteredCount,
  isAdmin,
  isOpen,
  onClose,
  onDateFilterChange,
  onSearchQueryChange,
  onSortOptionChange,
  searchQuery,
  sortOption,
  totalCount,
}: FilterDrawerProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[60] bg-zinc-950/20 backdrop-blur-sm dark:bg-zinc-950/60"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            animate={{ x: 0 }}
            aria-labelledby="filter-modal-title"
            aria-modal={true}
            className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-sm flex-col overflow-hidden border-zinc-200 border-l bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
            exit={{ x: "100%" }}
            initial={{ x: "100%" }}
            role="dialog"
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-center justify-between border-zinc-100 border-b px-8 py-5 dark:border-zinc-800">
              <h2
                className="font-display font-semibold text-2xl dark:text-zinc-50"
                id="filter-modal-title"
              >
                Filters
              </h2>
              <button
                aria-label="Close filters"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                onClick={onClose}
                type="button"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-col gap-6 overflow-y-auto p-8">
              <div className="group relative">
                <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
                  <MagnifyingGlass
                    aria-hidden="true"
                    className="h-5 w-5 text-zinc-400 transition-colors group-focus-within:text-accent"
                  />
                </div>
                <input
                  aria-label="Search tweets"
                  className="w-full rounded-2xl border border-zinc-200 bg-white py-4 pr-12 pl-12 text-sm shadow-sm transition-all focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                  onChange={(e) => onSearchQueryChange(e.target.value)}
                  placeholder="Search tweets..."
                  type="text"
                  value={searchQuery}
                />
                <AnimatePresence>
                  {searchQuery && (
                    <motion.button
                      animate={{ opacity: 1, scale: 1 }}
                      aria-label="Clear search"
                      className="absolute inset-y-0 right-4 flex items-center text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-200"
                      exit={{ opacity: 0, scale: 0.95 }}
                      initial={{ opacity: 0, scale: 0.95 }}
                      onClick={() => onSearchQueryChange("")}
                      type="button"
                    >
                      <X aria-hidden="true" className="h-4 w-4" weight="bold" />
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="flex flex-col gap-3">
                  <h3 className="font-bold text-xs text-zinc-400 uppercase tracking-widest">
                    Timeframe
                  </h3>
                  <div className="flex flex-col gap-1">
                    {DATES.map((date) => (
                      <button
                        className={cn(
                          "flex items-center rounded-xl border px-4 py-3 font-medium text-sm transition-all duration-300",
                          dateFilter === date
                            ? "border-zinc-300 bg-white text-zinc-950 shadow-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                            : "border-transparent bg-transparent text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                        )}
                        key={date}
                        onClick={() => onDateFilterChange(date)}
                        type="button"
                      >
                        {date}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <h3 className="font-bold text-xs text-zinc-400 uppercase tracking-widest">
                    Sort By
                  </h3>
                  <div className="flex flex-col rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-1 dark:border-zinc-800/80 dark:bg-zinc-800/30">
                    {SORTS.map((sort) => (
                      <button
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-4 py-3 font-medium text-sm transition-all duration-300",
                          sortOption === sort
                            ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                            : "text-zinc-500 hover:bg-white/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100"
                        )}
                        key={sort}
                        onClick={() => onSortOptionChange(sort)}
                        type="button"
                      >
                        {sort === "Newest" && (
                          <SortDescending
                            aria-hidden="true"
                            className="h-4 w-4"
                          />
                        )}
                        {sort === "Oldest" && (
                          <SortAscending
                            aria-hidden="true"
                            className="h-4 w-4"
                          />
                        )}
                        {sort === "Manual" && (
                          <ArrowUp aria-hidden="true" className="h-4 w-4" />
                        )}
                        {sort}
                      </button>
                    ))}
                  </div>
                  {sortOption === "Manual" &&
                    isAdmin &&
                    (searchQuery || dateFilter !== "All Time") && (
                      <p className="text-xs text-zinc-400 dark:text-zinc-500">
                        Clear search and date filters to enable reordering.
                      </p>
                    )}
                </div>
              </div>

              <p className="border-zinc-200 border-t pt-4 text-sm text-zinc-400 dark:border-zinc-800">
                Showing {filteredCount} of {totalCount} tweets
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
