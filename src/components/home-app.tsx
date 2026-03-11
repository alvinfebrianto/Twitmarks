"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  CheckSquare,
  Image as ImageIcon,
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

import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
} from "motion/react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canReorder, moveTweet } from "../lib/tweet-order";
import { clearSelection, toggleSelectId } from "../lib/tweet-selection";
import { cn } from "../lib/utils";
import { AddTweetModal } from "./add-tweet-modal";
import { ThemeToggle } from "./theme-toggle";

export interface DbTweet {
  created_at: string;
  embed_html: string;
  id: number;
  sort_order: number;
}

interface UiTweet extends DbTweet {
  createdAtMs: number;
  searchBlob: string;
}

interface TweetPhoto {
  height: number;
  url: string;
  width: number;
}

function extractTextContent(html: string): string {
  if (typeof DOMParser === "undefined") {
    return html.replace(/<[^>]*>/g, " ").toLowerCase();
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent ?? "").toLowerCase();
}

function normalizeTweet(tweet: DbTweet): UiTweet {
  return {
    ...tweet,
    createdAtMs: new Date(tweet.created_at).getTime(),
    searchBlob: extractTextContent(tweet.embed_html),
  };
}

function extractTweetId(html: string): string | null {
  const match = html.match(TWEET_ID_RE);
  return match?.[1] ?? null;
}

function hasTweetMedia(html: string): boolean {
  return TWEET_MEDIA_RE.test(html);
}

declare global {
  interface Window {
    twttr?: { widgets?: { load?: (el?: HTMLElement) => void } };
  }
}

const SORTS = ["Manual", "Newest", "Oldest"];
const DATES = ["All Time", "Last 7 Days", "Last 30 Days"];
const TWEET_ID_RE = /(?:twitter|x)\.com\/\w+\/status\/(\d+)/;
const TWEET_MEDIA_RE = /pic\.(twitter|x)\.com/;

const springConfig = { damping: 15, stiffness: 150, mass: 0.1 };

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

const ImageViewerModal = ({
  photos,
  onClose,
}: {
  photos: TweetPhoto[];
  onClose: () => void;
}) => {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        setCurrent((p) => Math.max(0, p - 1));
      } else if (e.key === "ArrowRight") {
        setCurrent((p) => Math.min(photos.length - 1, p + 1));
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, photos.length]);

  const photo = photos[current];
  if (!photo) {
    return null;
  }

  return (
    <>
      <motion.div
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-[80] bg-zinc-950/90 backdrop-blur-xl"
        exit={{ opacity: 0 }}
        initial={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        animate={{ opacity: 1, scale: 1 }}
        className="fixed inset-0 z-[90] flex cursor-zoom-out items-center justify-center p-6"
        exit={{ opacity: 0, scale: 0.96 }}
        initial={{ opacity: 0, scale: 0.96 }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
      >
        <div className="relative flex max-h-[90dvh] max-w-5xl cursor-default flex-col items-center gap-4">
          <img
            alt="Tweet media"
            className="max-h-[80dvh] max-w-full rounded-2xl object-contain shadow-[0_32px_64px_-16px_rgba(0,0,0,0.8)]"
            height={photo.height}
            src={`${photo.url}?format=jpg&name=large`}
            width={photo.width}
          />
          {photos.length > 1 && (
            <div className="flex items-center gap-3">
              <button
                aria-label="Previous image"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20 disabled:opacity-30"
                disabled={current === 0}
                onClick={() => setCurrent((p) => Math.max(0, p - 1))}
                type="button"
              >
                <ArrowLeft
                  aria-hidden="true"
                  className="h-3.5 w-3.5"
                  weight="bold"
                />
              </button>
              <span className="font-medium text-sm text-white/60 tabular-nums">
                {current + 1} / {photos.length}
              </span>
              <button
                aria-label="Next image"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20 disabled:opacity-30"
                disabled={current === photos.length - 1}
                onClick={() =>
                  setCurrent((p) => Math.min(photos.length - 1, p + 1))
                }
                type="button"
              >
                <ArrowRight
                  aria-hidden="true"
                  className="h-3.5 w-3.5"
                  weight="bold"
                />
              </button>
            </div>
          )}
        </div>
        <button
          aria-label="Close image viewer"
          className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          type="button"
        >
          <X aria-hidden="true" className="h-4 w-4" weight="bold" />
        </button>
      </motion.div>
    </>
  );
};

const TweetEmbed = ({
  tweet,
  isAdmin,
  isDark,
  showReorder,
  isFirst,
  isLast,
  isSelectionMode,
  isSelected,
  onDelete,
  onMoveUp,
  onMoveDown,
  onToggleSelect,
  onOpenImageViewer,
}: {
  tweet: DbTweet;
  isAdmin: boolean;
  isDark: boolean;
  showReorder: boolean;
  isFirst: boolean;
  isLast: boolean;
  isSelectionMode: boolean;
  isSelected: boolean;
  onDelete: (id: number) => void;
  onMoveUp: (id: number) => void;
  onMoveDown: (id: number) => void;
  onToggleSelect: (id: number) => void;
  onOpenImageViewer: (photos: TweetPhoto[]) => void;
}) => {
  const embedRef = useRef<HTMLDivElement>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isLoadingMedia, setIsLoadingMedia] = useState(false);
  const [photos, setPhotos] = useState<TweetPhoto[] | null>(null);

  const tweetId = useMemo(
    () => extractTweetId(tweet.embed_html),
    [tweet.embed_html]
  );
  const hasMedia = useMemo(
    () => hasTweetMedia(tweet.embed_html),
    [tweet.embed_html]
  );

  const handleMediaClick = useCallback(async () => {
    if (!tweetId || isLoadingMedia) {
      return;
    }
    if (photos !== null) {
      if (photos.length > 0) {
        onOpenImageViewer(photos);
      }
      return;
    }
    setIsLoadingMedia(true);
    try {
      const res = await fetch(`/api/media?id=${tweetId}`);
      if (res.ok) {
        const data = (await res.json()) as { photos: TweetPhoto[] };
        const fetched = data.photos ?? [];
        setPhotos(fetched);
        if (fetched.length > 0) {
          onOpenImageViewer(fetched);
        }
      } else {
        setPhotos([]);
      }
    } catch {
      setPhotos([]);
    } finally {
      setIsLoadingMedia(false);
    }
  }, [tweetId, isLoadingMedia, photos, onOpenImageViewer]);

  useEffect(() => {
    if (!embedRef.current) {
      return;
    }
    embedRef.current.innerHTML = tweet.embed_html;
    const blockquote = embedRef.current.querySelector("blockquote");
    if (blockquote) {
      blockquote.setAttribute("data-theme", isDark ? "dark" : "light");
    }
    window.twttr?.widgets?.load?.(embedRef.current);
  }, [tweet.embed_html, isDark]);

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="tweet-embed group relative overflow-hidden rounded-xl border border-zinc-200/60 bg-white shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] transition-shadow duration-500 hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.18)] dark:border-zinc-800/60 dark:bg-zinc-950 dark:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.35)] dark:hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.55)]"
      exit={{ opacity: 0, scale: 0.95 }}
      initial={{ opacity: 0, y: 20 }}
      layout="position"
      transition={{ type: "spring", stiffness: 100, damping: 20 }}
    >
      <div className="[&>blockquote]:m-0" ref={embedRef} />

      {isAdmin && isSelectionMode && (
        <label className="absolute top-3 left-3 z-10 flex h-6 w-6 cursor-pointer items-center justify-center">
          <input
            aria-label={`Select tweet ${tweet.id}`}
            checked={isSelected}
            className="sr-only"
            onChange={() => onToggleSelect(tweet.id)}
            type="checkbox"
          />
          <div
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all duration-200",
              isSelected
                ? "border-accent bg-accent text-white"
                : "border-zinc-300 bg-white/90 backdrop-blur-sm dark:border-zinc-600 dark:bg-zinc-800/90"
            )}
          >
            {isSelected && (
              <Check aria-hidden="true" className="h-3 w-3" weight="bold" />
            )}
          </div>
        </label>
      )}

      {hasMedia && !isSelectionMode && (
        <button
          aria-label="View tweet images"
          className="absolute top-3 left-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-zinc-950/50 text-white opacity-0 shadow-sm backdrop-blur-md transition-opacity duration-200 group-hover:opacity-100"
          onClick={handleMediaClick}
          type="button"
        >
          {isLoadingMedia ? (
            <motion.div
              animate={{ rotate: 360 }}
              className="h-3.5 w-3.5 rounded-full border border-white/40 border-t-white"
              transition={{
                duration: 0.8,
                ease: "linear",
                repeat: Number.POSITIVE_INFINITY,
              }}
            />
          ) : (
            <ImageIcon
              aria-hidden="true"
              className="h-3.5 w-3.5"
              weight="bold"
            />
          )}
        </button>
      )}

      {isAdmin && !isSelectionMode && (
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

const BulkActionBar = ({
  selectedCount,
  totalCount,
  isConfirming,
  onSelectAll,
  onRequestDelete,
  onConfirm,
  onCancelConfirm,
}: {
  selectedCount: number;
  totalCount: number;
  isConfirming: boolean;
  onSelectAll: () => void;
  onRequestDelete: () => void;
  onConfirm: () => void;
  onCancelConfirm: () => void;
}) => {
  const label = `${selectedCount} tweet${selectedCount !== 1 ? "s" : ""}`;
  return (
    <motion.div
      animate={{ y: 0, opacity: 1 }}
      className="fixed inset-x-4 bottom-8 z-50 mx-auto max-w-sm"
      exit={{ y: 20, opacity: 0 }}
      initial={{ y: 20, opacity: 0 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
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
};

function pruneSelectedIds(
  prev: Set<number>,
  visibleIds: Set<number>
): Set<number> {
  if (prev.size === 0) {
    return prev;
  }
  const next = new Set([...prev].filter((id) => visibleIds.has(id)));
  return next.size === prev.size ? prev : next;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: main app component with many features
export default function App({ initialTweets }: { initialTweets?: DbTweet[] }) {
  const needsClientLoad = initialTweets == null;
  const [tweets, setTweets] = useState<UiTweet[]>(() =>
    (initialTweets ?? []).map(normalizeTweet)
  );
  const [loading, setLoading] = useState(needsClientLoad);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("All Time");
  const [sortOption, setSortOption] = useState("Newest");
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [cols, setCols] = useState(3);
  const [isDark, setIsDark] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark")
  );
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

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(clearSelection);
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const [imageViewerPhotos, setImageViewerPhotos] = useState<
    TweetPhoto[] | null
  >(null);

  const handleOpenImageViewer = useCallback((photos: TweetPhoto[]) => {
    setImageViewerPhotos(photos);
  }, []);

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

  const lockAdmin = useCallback(() => {
    try {
      sessionStorage.removeItem("twitmarks_admin");
    } catch {
      // sessionStorage may be unavailable
    }
    setAdminSecret("");
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setSelectionMode(false);
      setSelectedIds(clearSelection());
      setConfirmingBulkDelete(false);
    }
  }, [isAdmin]);

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
      setTweets(data.map(normalizeTweet));
    } catch {
      setLoadError("Failed to load tweets. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: needsClientLoad is captured once at mount
  useEffect(() => {
    if (needsClientLoad) {
      loadTweets();
    }
  }, [loadTweets]);

  useEffect(() => {
    const updateCols = () => {
      const width = window.innerWidth;
      let next = 3;
      if (width < 768) {
        next = 1;
      } else if (width < 1024) {
        next = 2;
      }
      setCols((prev) => (prev === next ? prev : next));
    };
    updateCols();
    let timeoutId: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(updateCols, 100);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isFilterDrawerOpen) {
      return;
    }
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsFilterDrawerOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isFilterDrawerOpen]);

  useEffect(() => {
    if (!isAdminPromptOpen) {
      return;
    }
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsAdminPromptOpen(false);
        setAdminInput("");
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isAdminPromptOpen]);

  const filteredTweets = useMemo(() => {
    let result = [...tweets];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((t) => t.searchBlob.includes(q));
    }

    const now = Date.now();
    if (dateFilter === "Last 7 Days") {
      const cutoff = now - 7 * 24 * 60 * 60 * 1000;
      result = result.filter((t) => t.createdAtMs > cutoff);
    } else if (dateFilter === "Last 30 Days") {
      const cutoff = now - 30 * 24 * 60 * 60 * 1000;
      result = result.filter((t) => t.createdAtMs > cutoff);
    }

    if (sortOption === "Newest") {
      result.sort((a, b) => b.createdAtMs - a.createdAtMs);
    } else if (sortOption === "Oldest") {
      result.sort((a, b) => a.createdAtMs - b.createdAtMs);
    }

    return result;
  }, [tweets, searchQuery, dateFilter, sortOption]);

  useEffect(() => {
    const visibleIds = new Set(filteredTweets.map((t) => t.id));
    setSelectedIds((prev) => pruneSelectedIds(prev, visibleIds));
  }, [filteredTweets]);

  useEffect(() => {
    if (selectedIds.size === 0) {
      setConfirmingBulkDelete(false);
    }
  }, [selectedIds]);

  const masonryColumns = useMemo(() => {
    const effectiveCols = Math.min(cols, filteredTweets.length || 1);
    const columns: UiTweet[][] = Array.from(
      { length: effectiveCols },
      () => []
    );
    filteredTweets.forEach((tweet, i) => {
      columns[i % effectiveCols].push(tweet);
    });
    return columns;
  }, [filteredTweets, cols]);

  const handleDelete = useCallback(
    async (tweetId: number) => {
      if (isMutatingRef.current) {
        return;
      }
      isMutatingRef.current = true;
      const snapshot = [...tweets];
      setMutationError(null);
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
          if (res.status === 401) {
            lockAdmin();
            setMutationError("Admin session expired. Please unlock again.");
          } else {
            setMutationError("Failed to delete tweet. Please try again.");
          }
        }
      } catch {
        setTweets(snapshot);
        setMutationError("Failed to delete tweet. Please try again.");
      } finally {
        isMutatingRef.current = false;
      }
    },
    [tweets, adminSecret, lockAdmin]
  );

  const handleReorder = useCallback(
    async (tweetId: number, direction: "up" | "down") => {
      if (isMutatingRef.current) {
        return;
      }
      isMutatingRef.current = true;
      const currentIndex = tweets.findIndex((t) => t.id === tweetId);
      const targetIndex =
        direction === "up" ? currentIndex - 1 : currentIndex + 1;
      const targetId = tweets[targetIndex]?.id;

      if (targetId === undefined) {
        isMutatingRef.current = false;
        return;
      }

      const snapshot = [...tweets];
      setMutationError(null);
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
            movedId: tweetId,
            targetId,
          }),
        });

        if (!res.ok) {
          setTweets(snapshot);
          if (res.status === 401) {
            lockAdmin();
            setMutationError("Admin session expired. Please unlock again.");
          } else {
            setMutationError("Failed to reorder. Please try again.");
          }
        }
      } catch {
        setTweets(snapshot);
        setMutationError("Failed to reorder. Please try again.");
      } finally {
        isMutatingRef.current = false;
      }
    },
    [tweets, adminSecret, lockAdmin]
  );

  const isMutatingRef = useRef(false);
  const isBulkDeletingRef = useRef(false);

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: bulk delete requires granular error recovery per-tweet
  const handleBulkDelete = useCallback(async () => {
    if (isBulkDeletingRef.current || isMutatingRef.current) {
      return;
    }
    isBulkDeletingRef.current = true;
    isMutatingRef.current = true;
    try {
      const idsToDelete = [...selectedIds];
      if (idsToDelete.length === 0) {
        return;
      }
      const snapshot = [...tweets];
      setMutationError(null);
      setTweets((prev) => prev.filter((t) => !selectedIds.has(t.id)));
      setSelectedIds(clearSelection());
      setSelectionMode(false);
      setConfirmingBulkDelete(false);

      const results = await Promise.allSettled(
        idsToDelete.map((id) =>
          fetch("/api/tweets", {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${adminSecret}`,
            },
            body: JSON.stringify({ id }),
          })
        )
      );

      const tagged = results.map((r, i) => ({ r, id: idsToDelete[i] }));
      const failed = tagged.filter(
        ({ r }) => r.status === "rejected" || !r.value.ok
      );
      if (failed.length === 0) {
        return;
      }

      const failedIds = new Set(failed.map(({ id }) => id));
      const hadUnauthorized = failed.some(
        ({ r }) => r.status === "fulfilled" && r.value.status === 401
      );
      const failedTweets = snapshot.filter((t) => failedIds.has(t.id));
      setTweets((prev) =>
        [...prev, ...failedTweets].sort((a, b) => a.sort_order - b.sort_order)
      );
      if (hadUnauthorized) {
        lockAdmin();
        const nonAuthCount = failed.filter(
          ({ r }) => !(r.status === "fulfilled" && r.value.status === 401)
        ).length;
        const extra =
          nonAuthCount > 0
            ? ` Additionally, ${nonAuthCount} tweet${nonAuthCount !== 1 ? "s" : ""} could not be deleted.`
            : "";
        setMutationError(`Admin session expired. Please unlock again.${extra}`);
      } else {
        setMutationError(
          `Failed to delete ${failed.length} tweet${failed.length !== 1 ? "s" : ""}. Please try again.`
        );
      }
    } finally {
      isMutatingRef.current = false;
      isBulkDeletingRef.current = false;
    }
  }, [selectedIds, tweets, adminSecret, lockAdmin]);

  const toggleSelectionMode = useCallback(() => {
    if (selectionMode) {
      setSelectionMode(false);
      setSelectedIds(clearSelection());
      setConfirmingBulkDelete(false);
    } else {
      setSelectionMode(true);
    }
  }, [selectionMode]);

  return (
    <div className="min-h-[100dvh] bg-zinc-50 font-sans text-zinc-950 selection:bg-accent selection:text-white dark:bg-zinc-950 dark:text-zinc-50">
      <header className="pointer-events-none fixed top-0 right-0 left-0 z-50 px-4 py-3">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between">
          <div className="glass-panel pointer-events-auto flex items-center gap-2.5 rounded-full px-4 py-2">
            <div className="flex h-5 w-5 items-center justify-center rounded-md bg-zinc-950 dark:bg-zinc-100">
              <TwitterLogo
                aria-hidden="true"
                className="h-3.5 w-3.5 text-white dark:text-zinc-950"
                weight="fill"
              />
            </div>
            <span className="font-bold font-display text-base tracking-tight dark:text-zinc-50">
              Twitmarks
            </span>
          </div>

          <div className="pointer-events-auto flex items-center gap-2">
            <ThemeToggle />

            <MagneticButton
              aria-label={isAdmin ? "Lock admin" : "Unlock admin"}
              className={cn(
                "glass-panel flex h-9 w-9 items-center justify-center rounded-full",
                isAdmin
                  ? "text-accent dark:text-accent"
                  : "text-zinc-700 dark:text-zinc-300"
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
                  className="h-4 w-4"
                  weight="bold"
                />
              ) : (
                <LockSimple
                  aria-hidden="true"
                  className="h-4 w-4"
                  weight="bold"
                />
              )}
            </MagneticButton>

            {isAdmin && (
              <MagneticButton
                aria-label={
                  selectionMode ? "Cancel selection" : "Select tweets"
                }
                className={cn(
                  "glass-panel flex h-9 w-9 items-center justify-center rounded-full",
                  selectionMode
                    ? "text-accent dark:text-accent"
                    : "text-zinc-700 dark:text-zinc-300"
                )}
                onClick={toggleSelectionMode}
                type="button"
              >
                <CheckSquare
                  aria-hidden="true"
                  className="h-4 w-4"
                  weight="bold"
                />
              </MagneticButton>
            )}

            <MagneticButton
              aria-label="Open filters"
              className="glass-panel flex h-9 w-9 items-center justify-center rounded-full text-zinc-700 dark:text-zinc-300"
              onClick={() => setIsFilterDrawerOpen(true)}
              type="button"
            >
              <MagnifyingGlass
                aria-hidden="true"
                className="h-4 w-4"
                weight="bold"
              />
            </MagneticButton>

            <MagneticButton
              aria-label="Add new tweet"
              className="gap-1.5 rounded-full bg-zinc-950 px-4 py-2 font-medium text-white text-xs shadow-lg shadow-zinc-950/15 dark:bg-zinc-100 dark:text-zinc-950 dark:shadow-zinc-100/15"
              onClick={() => setIsAddModalOpen(true)}
              type="button"
            >
              <Plus aria-hidden="true" className="h-3.5 w-3.5" weight="bold" />
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
            {!loading && mutationError && (
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
                initial={{ opacity: 0, y: 8 }}
              >
                <p className="text-sm">{mutationError}</p>
                <button
                  className="rounded-full bg-red-100 px-4 py-2 font-medium text-red-800 text-xs transition-colors hover:bg-red-200 dark:bg-red-900/40 dark:text-red-200 dark:hover:bg-red-900/60"
                  onClick={() => setMutationError(null)}
                  type="button"
                >
                  Dismiss
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
              <div className="flex items-start justify-center gap-6">
                {masonryColumns
                  .filter((column) => column.length > 0)
                  .map((column, columnIndex) => {
                    return (
                      <div
                        className="flex w-full max-w-[550px] flex-col gap-6"
                        // biome-ignore lint/suspicious/noArrayIndexKey: masonry columns are structural containers with stable count
                        key={columnIndex}
                      >
                        <AnimatePresence mode="popLayout">
                          {column.map((tweet) => (
                            <TweetEmbed
                              isAdmin={isAdmin}
                              isDark={isDark}
                              isFirst={filteredTweets[0]?.id === tweet.id}
                              isLast={filteredTweets.at(-1)?.id === tweet.id}
                              isSelected={selectedIds.has(tweet.id)}
                              isSelectionMode={selectionMode}
                              key={tweet.id}
                              onDelete={handleDelete}
                              onMoveDown={(id) => handleReorder(id, "down")}
                              onMoveUp={(id) => handleReorder(id, "up")}
                              onOpenImageViewer={handleOpenImageViewer}
                              onToggleSelect={(id) =>
                                setSelectedIds((prev) =>
                                  toggleSelectId(prev, id)
                                )
                              }
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
        {selectionMode && selectedIds.size > 0 && (
          <BulkActionBar
            isConfirming={confirmingBulkDelete}
            key="bulk-action-bar"
            onCancelConfirm={() => setConfirmingBulkDelete(false)}
            onConfirm={handleBulkDelete}
            onRequestDelete={() => setConfirmingBulkDelete(true)}
            onSelectAll={() =>
              setSelectedIds(new Set(filteredTweets.map((t) => t.id)))
            }
            selectedCount={selectedIds.size}
            totalCount={filteredTweets.length}
          />
        )}
      </AnimatePresence>

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
              animate={{ y: 0, opacity: 1 }}
              aria-labelledby="filter-modal-title"
              aria-modal={true}
              className="fixed inset-x-4 top-[8%] z-[70] mx-auto flex max-h-[85vh] max-w-lg flex-col overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
              exit={{ y: 20, opacity: 0 }}
              initial={{ y: 20, opacity: 0 }}
              role="dialog"
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
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
                  onClick={() => setIsFilterDrawerOpen(false)}
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
                    className="w-full rounded-2xl border border-zinc-200 bg-white py-4 pr-4 pl-12 text-sm shadow-sm transition-all focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search tweets..."
                    type="text"
                    value={searchQuery}
                  />
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
                          onClick={() => setDateFilter(date)}
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
                              : "text-zinc-500 hover:bg-white/70 hover:text-zinc-900 dark:hover:bg-zinc-800/50"
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

                <div className="flex flex-col gap-4 border-zinc-200 border-t pt-2 dark:border-zinc-800">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1 rounded-2xl border border-zinc-200/50 bg-zinc-50 p-4 dark:border-zinc-800/50 dark:bg-zinc-800/30">
                      <span className="font-medium text-xs text-zinc-400 uppercase tracking-widest">
                        Total
                      </span>
                      <span className="font-medium font-mono text-2xl text-zinc-950 tracking-tighter dark:text-zinc-100">
                        {tweets.length}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 rounded-2xl border border-zinc-200/50 bg-zinc-50 p-4 dark:border-zinc-800/50 dark:bg-zinc-800/30">
                      <span className="font-medium text-xs text-zinc-400 uppercase tracking-widest">
                        Showing
                      </span>
                      <span className="font-medium font-mono text-2xl text-zinc-950 tracking-tighter dark:text-zinc-100">
                        {filteredTweets.length}
                      </span>
                    </div>
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
              aria-labelledby="admin-modal-title"
              aria-modal={true}
              className="fixed inset-x-4 top-[20%] z-[70] mx-auto max-w-sm overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
              exit={{ y: 20, opacity: 0 }}
              initial={{ y: 20, opacity: 0 }}
              role="dialog"
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
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
        initialSecret={adminSecret}
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
                data.why ??
                  data.error ??
                  `Failed to add tweet: ${response.status}`
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

      <AnimatePresence>
        {imageViewerPhotos && imageViewerPhotos.length > 0 && (
          <ImageViewerModal
            key="image-viewer"
            onClose={() => setImageViewerPhotos(null)}
            photos={imageViewerPhotos}
          />
        )}
      </AnimatePresence>

      {import.meta.env.DEV && <Agentation />}
    </div>
  );
}
