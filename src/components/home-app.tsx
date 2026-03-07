"use client";

import {
  ArrowDown,
  ArrowUp,
  LockSimple,
  LockSimpleOpen,
  MagnifyingGlass,
  Plus,
  SortAscending,
  SortDescending,
  Trash,
  TwitterLogo,
  X,
} from "@phosphor-icons/react";
import { Agentation } from "agentation";
import { isAfter, subDays } from "date-fns";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
} from "motion/react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canReorder, moveTweet } from "../lib/tweet-order";
import { cn } from "../lib/utils";
import { AddTweetModal } from "./add-tweet-modal";
import { ThemeToggle } from "./theme-toggle";

export interface DbTweet {
  created_at: string;
  embed_html: string;
  id: number;
  sort_order: number;
}

declare global {
  interface Window {
    twttr?: { widgets?: { load?: (el?: HTMLElement) => void } };
  }
}

const SORTS = ["Manual", "Newest", "Oldest"];
const DATES = ["All Time", "This Week", "This Month"];

export const MagneticButton = ({
  children,
  className,
  onClick,
  type = "button",
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  "aria-label"?: string;
}) => {
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const springConfig = { damping: 15, stiffness: 150, mass: 0.1 };
  const springX = useSpring(x, springConfig);
  const springY = useSpring(y, springConfig);

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    x.set((e.clientX - centerX) * 0.2);
    y.set((e.clientY - centerY) * 0.2);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.button
      aria-label={ariaLabel}
      className={cn(
        "relative flex items-center justify-center transition-colors",
        className
      )}
      onClick={onClick}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      style={{ x: springX, y: springY }}
      type={type}
      whileTap={{ scale: 0.95 }}
    >
      {children}
    </motion.button>
  );
};

const TweetEmbed = ({
  tweet,
  isAdmin,
  showReorder,
  isFirst,
  isLast,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  tweet: DbTweet;
  isAdmin: boolean;
  showReorder: boolean;
  isFirst: boolean;
  isLast: boolean;
  onDelete: (id: number) => void;
  onMoveUp: (id: number) => void;
  onMoveDown: (id: number) => void;
}) => {
  const embedRef = useRef<HTMLDivElement>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!embedRef.current) {
      return;
    }
    embedRef.current.innerHTML = tweet.embed_html;
    window.twttr?.widgets?.load?.(embedRef.current);
  }, [tweet.embed_html]);

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="tweet-embed group relative overflow-hidden rounded-[2rem] border border-zinc-200/50 bg-white p-4 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.03)] transition-shadow duration-500 hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.08)] dark:border-zinc-800/50 dark:bg-zinc-900 dark:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.2)] dark:hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.3)]"
      exit={{ opacity: 0, scale: 0.95 }}
      initial={{ opacity: 0, y: 20 }}
      layout="position"
      transition={{ type: "spring", stiffness: 100, damping: 20 }}
    >
      <div ref={embedRef} />

      {isAdmin && (
        <AnimatePresence>
          {confirmingDelete ? (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="absolute right-3 bottom-3 left-3 flex items-center justify-between gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 dark:border-red-900/60 dark:bg-red-950/80"
              exit={{ opacity: 0, y: 8 }}
              initial={{ opacity: 0, y: 8 }}
              key="confirm"
            >
              <span className="font-medium text-red-800 text-xs dark:text-red-200">
                Delete this tweet?
              </span>
              <div className="flex gap-2">
                <button
                  className="rounded-full bg-white px-3 py-1.5 font-medium text-xs text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  onClick={() => setConfirmingDelete(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-full bg-red-600 px-3 py-1.5 font-medium text-white text-xs shadow-sm transition-colors hover:bg-red-700"
                  onClick={() => onDelete(tweet.id)}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              animate={{ opacity: 1 }}
              className="absolute top-3 right-3 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              key="actions"
            >
              {showReorder && (
                <>
                  <button
                    aria-label="Move tweet up"
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white/90 text-zinc-600 shadow-sm backdrop-blur-sm transition-all hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/90 dark:text-zinc-400 dark:hover:bg-zinc-700",
                      isFirst && "pointer-events-none opacity-30"
                    )}
                    disabled={isFirst}
                    onClick={() => onMoveUp(tweet.id)}
                    type="button"
                  >
                    <ArrowUp
                      aria-hidden="true"
                      className="h-3.5 w-3.5"
                      weight="bold"
                    />
                  </button>
                  <button
                    aria-label="Move tweet down"
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white/90 text-zinc-600 shadow-sm backdrop-blur-sm transition-all hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/90 dark:text-zinc-400 dark:hover:bg-zinc-700",
                      isLast && "pointer-events-none opacity-30"
                    )}
                    disabled={isLast}
                    onClick={() => onMoveDown(tweet.id)}
                    type="button"
                  >
                    <ArrowDown
                      aria-hidden="true"
                      className="h-3.5 w-3.5"
                      weight="bold"
                    />
                  </button>
                </>
              )}
              <button
                aria-label="Delete tweet"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-red-200 bg-white/90 text-red-500 shadow-sm backdrop-blur-sm transition-all hover:bg-red-50 dark:border-red-900/60 dark:bg-zinc-800/90 dark:text-red-400 dark:hover:bg-red-950/60"
                onClick={() => setConfirmingDelete(true)}
                type="button"
              >
                <Trash
                  aria-hidden="true"
                  className="h-3.5 w-3.5"
                  weight="bold"
                />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </motion.div>
  );
};

export default function App() {
  const [tweets, setTweets] = useState<DbTweet[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("All Time");
  const [sortOption, setSortOption] = useState("Newest");
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cols, setCols] = useState(3);
  const gridRef = useRef<HTMLDivElement>(null);

  const [adminSecret, setAdminSecret] = useState(() => {
    try {
      return sessionStorage.getItem("twitmarks_admin") ?? "";
    } catch {
      return "";
    }
  });
  const isAdmin = adminSecret.length > 0;

  const [isAdminPromptOpen, setIsAdminPromptOpen] = useState(false);
  const [adminInput, setAdminInput] = useState("");

  const persistAdminSecret = useCallback((secret: string) => {
    const trimmed = secret.trim();
    if (!trimmed) {
      return;
    }
    try {
      sessionStorage.setItem("twitmarks_admin", trimmed);
    } catch {
      // sessionStorage may be unavailable
    }
    setAdminSecret(trimmed);
  }, []);

  const unlockAdmin = () => {
    persistAdminSecret(adminInput);
    setAdminInput("");
    setIsAdminPromptOpen(false);
  };

  const lockAdmin = () => {
    try {
      sessionStorage.removeItem("twitmarks_admin");
    } catch {
      // sessionStorage may be unavailable
    }
    setAdminSecret("");
  };

  const showReorderControls =
    isAdmin && canReorder({ sortOption, searchQuery, dateFilter });

  const loadTweets = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await fetch("/api/tweets");
      if (!res.ok) {
        setLoadError("Failed to load tweets. Please refresh.");
        return;
      }
      const data = (await res.json()) as DbTweet[];
      setTweets(data);
    } catch {
      setLoadError("Failed to load tweets. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTweets();
  }, [loadTweets]);

  useEffect(() => {
    const gridElement = gridRef.current;
    if (tweets.length === 0 || !gridElement) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      window.twttr?.widgets?.load?.(gridElement);
    });
    return () => cancelAnimationFrame(frame);
  }, [tweets]);

  useEffect(() => {
    const updateCols = () => {
      if (window.innerWidth < 768) {
        setCols(1);
      } else if (window.innerWidth < 1024) {
        setCols(2);
      } else {
        setCols(3);
      }
    };
    updateCols();
    window.addEventListener("resize", updateCols);
    return () => window.removeEventListener("resize", updateCols);
  }, []);

  const filteredTweets = useMemo(() => {
    let result = [...tweets];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((t) => t.embed_html.toLowerCase().includes(q));
    }

    const now = new Date();
    if (dateFilter === "This Week") {
      result = result.filter((t) =>
        isAfter(new Date(t.created_at), subDays(now, 7))
      );
    } else if (dateFilter === "This Month") {
      result = result.filter((t) =>
        isAfter(new Date(t.created_at), subDays(now, 30))
      );
    }

    if (sortOption === "Newest") {
      result.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    } else if (sortOption === "Oldest") {
      result.sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    }

    return result;
  }, [tweets, searchQuery, dateFilter, sortOption]);

  const masonryColumns = useMemo(() => {
    const columns: DbTweet[][] = Array.from({ length: cols }, () => []);
    filteredTweets.forEach((tweet, i) => {
      columns[i % cols].push(tweet);
    });
    return columns;
  }, [filteredTweets, cols]);

  const handleDelete = useCallback(
    async (tweetId: number) => {
      const snapshot = [...tweets];
      setTweets((prev) => prev.filter((t) => t.id !== tweetId));

      try {
        const res = await fetch("/api/tweets", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminSecret}`,
          },
          body: JSON.stringify({ id: tweetId }),
        });

        if (!res.ok) {
          setTweets(snapshot);
          setLoadError("Failed to delete tweet. Please try again.");
        }
      } catch {
        setTweets(snapshot);
        setLoadError("Failed to delete tweet. Please try again.");
      }
    },
    [tweets, adminSecret]
  );

  const handleReorder = useCallback(
    async (tweetId: number, direction: "up" | "down") => {
      const snapshot = [...tweets];
      const reordered = moveTweet(tweets, tweetId, direction);
      setTweets(reordered);

      try {
        const res = await fetch("/api/tweets", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminSecret}`,
          },
          body: JSON.stringify({
            orderedIds: reordered.map((t) => t.id),
          }),
        });

        if (!res.ok) {
          setTweets(snapshot);
          setLoadError("Failed to reorder. Please try again.");
        }
      } catch {
        setTweets(snapshot);
        setLoadError("Failed to reorder. Please try again.");
      }
    },
    [tweets, adminSecret]
  );

  return (
    <div className="min-h-[100dvh] bg-zinc-50 font-sans text-zinc-950 selection:bg-accent selection:text-white dark:bg-zinc-950 dark:text-zinc-50">
      <header className="pointer-events-none fixed top-0 right-0 left-0 z-50 px-4 py-4">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between">
          <div className="glass-panel pointer-events-auto flex items-center gap-3 rounded-full px-6 py-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-zinc-950 dark:bg-zinc-100">
              <TwitterLogo
                aria-hidden="true"
                className="h-4 w-4 text-white dark:text-zinc-950"
                weight="fill"
              />
            </div>
            <span className="font-bold font-display text-lg tracking-tight dark:text-zinc-50">
              Twitmarks
            </span>
          </div>

          <div className="pointer-events-auto flex items-center gap-3">
            <ThemeToggle />

            <MagneticButton
              aria-label={isAdmin ? "Lock admin" : "Unlock admin"}
              className={cn(
                "glass-panel flex h-12 w-12 items-center justify-center rounded-full",
                isAdmin
                  ? "text-accent dark:text-accent"
                  : "text-zinc-950 dark:text-zinc-100"
              )}
              onClick={() => {
                if (isAdmin) {
                  lockAdmin();
                } else {
                  setIsAdminPromptOpen(true);
                }
              }}
              type="button"
            >
              {isAdmin ? (
                <LockSimpleOpen
                  aria-hidden="true"
                  className="h-5 w-5"
                  weight="bold"
                />
              ) : (
                <LockSimple
                  aria-hidden="true"
                  className="h-5 w-5"
                  weight="bold"
                />
              )}
            </MagneticButton>

            <MagneticButton
              aria-label="Open filters"
              className="glass-panel flex h-12 w-12 items-center justify-center rounded-full text-zinc-950 dark:text-zinc-100"
              onClick={() => setIsFilterDrawerOpen(true)}
              type="button"
            >
              <MagnifyingGlass
                aria-hidden="true"
                className="h-5 w-5"
                weight="bold"
              />
            </MagneticButton>

            <MagneticButton
              aria-label="Add new tweet"
              className="gap-2 rounded-full bg-zinc-950 px-6 py-3 font-medium text-sm text-white shadow-xl shadow-zinc-950/20 dark:bg-zinc-100 dark:text-zinc-950 dark:shadow-zinc-100/20"
              onClick={() => setIsAddModalOpen(true)}
              type="button"
            >
              <Plus aria-hidden="true" className="h-4 w-4" weight="bold" />
              <span>Add Tweet</span>
            </MagneticButton>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 pt-24 pb-32 md:px-8">
        <div className="grid grid-cols-1 items-start gap-6">
          <div ref={gridRef}>
            {loading && (
              <div className="flex w-full items-center justify-center p-16">
                <motion.div
                  animate={{ rotate: 360 }}
                  className="h-8 w-8 rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100"
                  transition={{
                    duration: 1,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: "linear",
                  }}
                />
              </div>
            )}
            {!loading && loadError && (
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
                initial={{ opacity: 0, y: 8 }}
              >
                <p className="text-sm">{loadError}</p>
                <button
                  className="rounded-full bg-red-100 px-4 py-2 font-medium text-red-800 text-xs transition-colors hover:bg-red-200 dark:bg-red-900/40 dark:text-red-200 dark:hover:bg-red-900/60"
                  onClick={() => {
                    setLoadError(null);
                    loadTweets();
                  }}
                  type="button"
                >
                  Retry
                </button>
              </motion.div>
            )}
            {!loading && filteredTweets.length === 0 && (
              <motion.div
                animate={{ opacity: 1, scale: 1 }}
                className="flex w-full flex-col items-center justify-center gap-6 rounded-[3rem] border border-zinc-200 border-dashed bg-white p-16 text-center dark:border-zinc-800 dark:bg-zinc-900"
                initial={{ opacity: 0, scale: 0.95 }}
              >
                <div className="flex h-20 w-20 items-center justify-center rounded-full border border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800">
                  <TwitterLogo
                    aria-hidden="true"
                    className="h-8 w-8 text-zinc-300"
                    weight="fill"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <h3 className="font-display font-semibold text-2xl text-zinc-950 dark:text-zinc-50">
                    {tweets.length === 0 ? "No tweets yet" : "No tweets found"}
                  </h3>
                  <p className="mx-auto max-w-[30ch] text-zinc-500 dark:text-zinc-400">
                    {tweets.length === 0
                      ? "Add your first tweet embed using the button above."
                      : "Try adjusting your search or filters."}
                  </p>
                </div>
                {tweets.length > 0 && (
                  <button
                    className="mt-4 flex items-center gap-2 rounded-full bg-zinc-100 px-6 py-3 font-medium text-sm text-zinc-950 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
                    onClick={() => {
                      setSearchQuery("");
                      setDateFilter("All Time");
                    }}
                    type="button"
                  >
                    Clear all filters
                  </button>
                )}
              </motion.div>
            )}
            {!loading && filteredTweets.length > 0 && (
              <div className="flex items-start gap-6">
                {masonryColumns
                  .filter((column) => column.length > 0)
                  .map((column) => {
                    const colKey = column.map((t) => t.id).join("-");
                    return (
                      <div className="flex flex-1 flex-col gap-6" key={colKey}>
                        <AnimatePresence mode="popLayout">
                          {column.map((tweet) => (
                            <TweetEmbed
                              isAdmin={isAdmin}
                              isFirst={filteredTweets[0]?.id === tweet.id}
                              isLast={filteredTweets.at(-1)?.id === tweet.id}
                              key={tweet.id}
                              onDelete={handleDelete}
                              onMoveDown={(id) => handleReorder(id, "down")}
                              onMoveUp={(id) => handleReorder(id, "up")}
                              showReorder={showReorderControls}
                              tweet={tweet}
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      </main>

      <AnimatePresence>
        {isFilterDrawerOpen && (
          <>
            <motion.div
              animate={{ opacity: 1 }}
              className="fixed inset-0 z-[60] bg-zinc-950/20 backdrop-blur-sm dark:bg-zinc-950/60"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              onClick={() => setIsFilterDrawerOpen(false)}
            />
            <motion.div
              animate={{ x: 0 }}
              className="fixed top-0 right-0 bottom-0 z-[70] flex w-full max-w-md flex-col gap-8 overflow-y-auto bg-white p-8 shadow-2xl dark:bg-zinc-900"
              exit={{ x: "100%" }}
              initial={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display font-semibold text-2xl dark:text-zinc-50">
                  Filters
                </h2>
                <button
                  aria-label="Close filters"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                  onClick={() => setIsFilterDrawerOpen(false)}
                  type="button"
                >
                  <X aria-hidden="true" className="h-5 w-5" />
                </button>
              </div>

              <div className="group relative">
                <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
                  <MagnifyingGlass
                    aria-hidden="true"
                    className="h-5 w-5 text-zinc-400 transition-colors group-focus-within:text-accent"
                  />
                </div>
                <input
                  aria-label="Search tweets"
                  className="w-full rounded-2xl border border-zinc-200 bg-white py-4 pr-4 pl-12 text-sm shadow-sm transition-all focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tweets..."
                  type="text"
                  value={searchQuery}
                />
              </div>

              <div className="flex flex-col gap-4">
                <h3 className="font-bold text-xs text-zinc-400 uppercase tracking-widest">
                  Timeframe
                </h3>
                <div className="flex flex-col gap-2">
                  {DATES.map((date) => (
                    <button
                      className={cn(
                        "flex items-center rounded-xl border px-4 py-3 font-medium text-sm transition-all duration-300",
                        dateFilter === date
                          ? "border-zinc-300 bg-white text-zinc-950 shadow-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                          : "border-transparent bg-transparent text-zinc-500 hover:bg-white/50 dark:hover:bg-zinc-900/50"
                      )}
                      key={date}
                      onClick={() => setDateFilter(date)}
                      type="button"
                    >
                      {date}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <h3 className="font-bold text-xs text-zinc-400 uppercase tracking-widest">
                  Sort By
                </h3>
                <div className="flex flex-col rounded-2xl border border-zinc-200/80 bg-white p-1 dark:border-zinc-800/80 dark:bg-zinc-900">
                  {SORTS.map((sort) => (
                    <button
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-4 py-3 font-medium text-sm transition-all duration-300",
                        sortOption === sort
                          ? "bg-zinc-50 text-zinc-950 dark:bg-zinc-800 dark:text-zinc-100"
                          : "text-zinc-500 hover:bg-zinc-50/50 hover:text-zinc-900 dark:hover:bg-zinc-800/50"
                      )}
                      key={sort}
                      onClick={() => setSortOption(sort)}
                      type="button"
                    >
                      {sort === "Newest" && (
                        <SortDescending
                          aria-hidden="true"
                          className="h-4 w-4"
                        />
                      )}
                      {sort === "Oldest" && (
                        <SortAscending aria-hidden="true" className="h-4 w-4" />
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

              <div className="mt-auto flex flex-col gap-4 border-zinc-200 border-t pt-6 dark:border-zinc-800">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1 rounded-2xl border border-zinc-200/50 bg-zinc-50 p-4 dark:border-zinc-800/50 dark:bg-zinc-900">
                    <span className="font-medium text-xs text-zinc-400 uppercase tracking-widest">
                      Total
                    </span>
                    <span className="font-medium font-mono text-2xl text-zinc-950 tracking-tighter dark:text-zinc-100">
                      {tweets.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 rounded-2xl border border-zinc-200/50 bg-zinc-50 p-4 dark:border-zinc-800/50 dark:bg-zinc-900">
                    <span className="font-medium text-xs text-zinc-400 uppercase tracking-widest">
                      Showing
                    </span>
                    <span className="font-medium font-mono text-2xl text-zinc-950 tracking-tighter dark:text-zinc-100">
                      {filteredTweets.length}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAdminPromptOpen && (
          <>
            <motion.div
              animate={{ opacity: 1 }}
              className="fixed inset-0 z-[60] bg-zinc-950/20 backdrop-blur-sm dark:bg-zinc-950/60"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              onClick={() => {
                setIsAdminPromptOpen(false);
                setAdminInput("");
              }}
            />
            <motion.div
              animate={{ y: 0, opacity: 1 }}
              className="fixed inset-x-4 top-[20%] z-[70] mx-auto max-w-sm overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
              exit={{ y: 20, opacity: 0 }}
              initial={{ y: 20, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
            >
              <div className="flex items-center justify-between border-zinc-100 border-b px-6 py-4 dark:border-zinc-800">
                <h2 className="font-display font-semibold text-lg dark:text-zinc-50">
                  Admin Access
                </h2>
                <button
                  aria-label="Close"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                  onClick={() => {
                    setIsAdminPromptOpen(false);
                    setAdminInput("");
                  }}
                  type="button"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
              <form
                className="flex flex-col gap-4 p-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  unlockAdmin();
                }}
              >
                <input
                  autoFocus
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm transition-all focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                  onChange={(e) => setAdminInput(e.target.value)}
                  placeholder="Enter admin secret"
                  type="password"
                  value={adminInput}
                />
                <button
                  className="w-full rounded-full bg-zinc-950 px-6 py-3 font-medium text-sm text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
                  disabled={!adminInput.trim()}
                  type="submit"
                >
                  Unlock
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AddTweetModal
        error={addError}
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setAddError(null);
        }}
        onSubmit={async (embedHtml, embedAdminSecret) => {
          setAddError(null);
          try {
            const response = await fetch("/api/tweets", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${embedAdminSecret}`,
              },
              body: JSON.stringify({ embed_html: embedHtml }),
            });

            if (!response.ok) {
              const data = await response.json().catch(() => ({}));
              throw new Error(
                data.message || `Failed to add tweet: ${response.status}`
              );
            }

            persistAdminSecret(embedAdminSecret);
            setIsAddModalOpen(false);
            await loadTweets();
          } catch (error) {
            setAddError(
              error instanceof Error ? error.message : "Failed to add tweet"
            );
            throw error;
          }
        }}
      />

      {import.meta.env.DEV && <Agentation />}
    </div>
  );
}
