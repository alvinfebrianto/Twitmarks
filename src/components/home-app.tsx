"use client";

import {
  ArrowsLeftRight,
  BookmarkSimple,
  Calendar,
  ChatCircle,
  CheckCircle,
  Funnel,
  Heart,
  MagnifyingGlass,
  Plus,
  SortAscending,
  SortDescending,
  TwitterLogo,
  X,
} from "@phosphor-icons/react";
import { isAfter, subDays } from "date-fns";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
} from "motion/react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "../lib/utils";

export interface Tweet {
  author: string;
  category: string;
  content: string;
  date: Date;
  handle: string;
  id: number;
  image: string | null;
  likes: number;
  replies: number;
  retweets: number;
}

const CATEGORIES = [
  "Tech",
  "Design",
  "News",
  "Entertainment",
  "Sports",
  "Other",
];
const SORTS = ["Newest", "Oldest", "Most Liked"];
const DATES = ["All Time", "This Week", "This Month"];

export const MagneticButton = ({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
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
      className={cn(
        "relative flex items-center justify-center transition-colors",
        className
      )}
      onClick={onClick}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      style={{ x: springX, y: springY }}
      type="button"
      whileTap={{ scale: 0.95 }}
    >
      {children}
    </motion.button>
  );
};

export const TweetCard = ({ tweet }: { tweet: Tweet }) => {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="group flex flex-col gap-4 rounded-[2rem] border border-zinc-200/50 bg-white p-6 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.03)] transition-shadow duration-500 hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.08)]"
      exit={{ opacity: 0, scale: 0.95 }}
      initial={{ opacity: 0, y: 20 }}
      layout
      transition={{ type: "spring", stiffness: 100, damping: 20 }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 overflow-hidden rounded-full border border-zinc-200 bg-zinc-100">
            <img
              alt={tweet.author}
              className="h-full w-full object-cover"
              height={40}
              src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${tweet.author}`}
              width={40}
            />
          </div>
          <div className="flex flex-col">
            <span className="font-display font-semibold text-zinc-950 leading-tight">
              {tweet.author}
            </span>
            <span className="font-mono text-sm text-zinc-500 tracking-tight">
              {tweet.handle}
            </span>
          </div>
        </div>
        <TwitterLogo
          className="h-6 w-6 text-[#1DA1F2] opacity-80"
          weight="fill"
        />
      </div>

      <p className="text-[15px] text-zinc-800 leading-relaxed">
        {tweet.content}
      </p>

      {tweet.image && (
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-zinc-100 bg-zinc-50">
          <img
            alt="Tweet media"
            className="h-full w-full object-cover"
            height={300}
            referrerPolicy="no-referrer"
            src={tweet.image}
            width={500}
          />
        </div>
      )}

      <div className="mt-2 flex items-center justify-between border-zinc-100/80 border-t pt-4 text-zinc-400">
        <div className="flex items-center gap-6">
          <button
            className="group/btn flex items-center gap-2 transition-colors hover:text-zinc-900"
            type="button"
          >
            <ChatCircle
              className="h-5 w-5 transition-transform group-hover/btn:scale-110"
              weight="regular"
            />
            <span className="font-mono text-xs">{tweet.replies}</span>
          </button>
          <button
            className="group/btn flex items-center gap-2 transition-colors hover:text-emerald-500"
            type="button"
          >
            <ArrowsLeftRight
              className="h-5 w-5 transition-transform group-hover/btn:scale-110"
              weight="regular"
            />
            <span className="font-mono text-xs">{tweet.retweets}</span>
          </button>
          <button
            className="group/btn flex items-center gap-2 transition-colors hover:text-rose-500"
            type="button"
          >
            <Heart
              className="h-5 w-5 transition-transform group-hover/btn:scale-110"
              weight="regular"
            />
            <span className="font-mono text-xs">{tweet.likes}</span>
          </button>
        </div>
        <button className="transition-colors hover:text-accent" type="button">
          <BookmarkSimple className="h-5 w-5" weight="regular" />
        </button>
      </div>

      <div className="absolute -top-3 -right-3">
        <span className="rounded-full bg-zinc-950 px-3 py-1.5 font-mono text-[10px] text-white uppercase tracking-widest shadow-lg">
          {tweet.category}
        </span>
      </div>
    </motion.div>
  );
};

export default function App() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState("All Time");
  const [sortOption, setSortOption] = useState("Newest");
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [cols, setCols] = useState(3);

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
    let result: Tweet[] = [];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = MOCK_TWEETS.filter(
        (t) =>
          t.content.toLowerCase().includes(q) ||
          t.author.toLowerCase().includes(q) ||
          t.handle.toLowerCase().includes(q)
      );
    } else {
      result = [...MOCK_TWEETS];
    }

    if (selectedCategories.length > 0) {
      result = result.filter((t) => selectedCategories.includes(t.category));
    }

    const now = new Date();
    if (dateFilter === "This Week") {
      result = result.filter((t) => isAfter(t.date, subDays(now, 7)));
    } else if (dateFilter === "This Month") {
      result = result.filter((t) => isAfter(t.date, subDays(now, 30)));
    }

    if (sortOption === "Newest") {
      result.sort((a, b) => b.date.getTime() - a.date.getTime());
    } else if (sortOption === "Oldest") {
      result.sort((a, b) => a.date.getTime() - b.date.getTime());
    } else if (sortOption === "Most Liked") {
      result.sort((a, b) => b.likes - a.likes);
    }

    return result;
  }, [searchQuery, selectedCategories, dateFilter, sortOption]);

  const masonryColumns = useMemo(() => {
    const columns: Tweet[][] = Array.from({ length: cols }, () => []);
    filteredTweets.forEach((tweet, i) => {
      columns[i % cols].push(tweet);
    });
    return columns;
  }, [filteredTweets, cols]);

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  return (
    <div className="min-h-[100dvh] bg-zinc-50 font-sans text-zinc-950 selection:bg-accent selection:text-white">
      <header className="pointer-events-none fixed top-0 right-0 left-0 z-50 px-4 py-4">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between">
          <div className="glass-panel pointer-events-auto flex items-center gap-3 rounded-full px-6 py-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-zinc-950">
              <TwitterLogo className="h-4 w-4 text-white" weight="fill" />
            </div>
            <span className="font-bold font-display text-lg tracking-tight">
              Xookmarks
            </span>
          </div>

          <div className="pointer-events-auto flex items-center gap-4">
            <button
              className="glass-panel flex h-12 w-12 items-center justify-center rounded-full text-zinc-950 md:hidden"
              onClick={() => setIsMobileFiltersOpen(true)}
              type="button"
            >
              <Funnel className="h-5 w-5" weight="bold" />
            </button>

            <MagneticButton className="gap-2 rounded-full bg-zinc-950 px-6 py-3 font-medium text-sm text-white shadow-xl shadow-zinc-950/20">
              <Plus className="h-4 w-4" weight="bold" />
              <span>Add Tweet</span>
            </MagneticButton>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1400px] px-4 pt-32 pb-16 md:px-8">
        <div className="grid grid-cols-1 items-end gap-12 lg:grid-cols-12">
          <div className="flex flex-col gap-6 lg:col-span-7">
            <motion.h1
              animate={{ opacity: 1, y: 0 }}
              className="font-display font-semibold text-5xl text-zinc-950 leading-[1.1] tracking-tighter md:text-7xl"
              initial={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            >
              Curate the noise.
              <br />
              <span className="text-zinc-400">Save the signal.</span>
            </motion.h1>
            <motion.p
              animate={{ opacity: 1, y: 0 }}
              className="max-w-[45ch] text-lg text-zinc-500 leading-relaxed"
              initial={{ opacity: 0, y: 20 }}
              transition={{
                duration: 0.8,
                delay: 0.1,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              Your personal gallery of high-signal Twitter embeds. Organized,
              searchable, and beautifully presented.
            </motion.p>
          </div>

          <div className="flex flex-col gap-4 lg:col-span-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2 rounded-[2rem] border border-zinc-200/50 bg-white p-6">
                <span className="font-medium text-sm text-zinc-400 uppercase tracking-widest">
                  Total Saved
                </span>
                <span className="font-medium font-mono text-4xl tracking-tighter">
                  {MOCK_TWEETS.length}
                </span>
              </div>
              <div className="flex flex-col gap-2 rounded-[2rem] border border-zinc-200/50 bg-white p-6">
                <span className="font-medium text-sm text-zinc-400 uppercase tracking-widest">
                  Categories
                </span>
                <span className="font-medium font-mono text-4xl tracking-tighter">
                  {CATEGORIES.length}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-[1400px] px-4 pb-32 md:px-8">
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
          <aside className="sticky top-32 hidden flex-col gap-8 lg:col-span-3 lg:flex">
            <div className="group relative">
              <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
                <MagnifyingGlass className="h-5 w-5 text-zinc-400 transition-colors group-focus-within:text-accent" />
              </div>
              <input
                className="w-full rounded-2xl border border-zinc-200/80 bg-white py-4 pr-4 pl-12 text-sm shadow-sm transition-all focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tweets..."
                type="text"
                value={searchQuery}
              />
            </div>

            <div className="flex flex-col gap-4">
              <h3 className="font-bold text-xs text-zinc-400 uppercase tracking-widest">
                Categories
              </h3>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => {
                  const isActive = selectedCategories.includes(cat);
                  return (
                    <button
                      className={cn(
                        "rounded-full border px-4 py-2 font-medium text-sm transition-all duration-300",
                        isActive
                          ? "border-zinc-950 bg-zinc-950 text-white shadow-md"
                          : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
                      )}
                      key={cat}
                      onClick={() => toggleCategory(cat)}
                      type="button"
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <h3 className="font-bold text-xs text-zinc-400 uppercase tracking-widest">
                Timeframe
              </h3>
              <div className="flex flex-col gap-2">
                {DATES.map((date) => (
                  <button
                    className={cn(
                      "flex items-center justify-between rounded-xl border px-4 py-3 font-medium text-sm transition-all duration-300",
                      dateFilter === date
                        ? "border-zinc-300 bg-white text-zinc-950 shadow-sm"
                        : "border-transparent bg-transparent text-zinc-500 hover:bg-white/50"
                    )}
                    key={date}
                    onClick={() => setDateFilter(date)}
                    type="button"
                  >
                    <div className="flex items-center gap-3">
                      <Calendar
                        className="h-4 w-4"
                        weight={dateFilter === date ? "fill" : "regular"}
                      />
                      {date}
                    </div>
                    {dateFilter === date && (
                      <CheckCircle
                        className="h-4 w-4 text-zinc-950"
                        weight="fill"
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <h3 className="font-bold text-xs text-zinc-400 uppercase tracking-widest">
                Sort By
              </h3>
              <div className="flex flex-col rounded-2xl border border-zinc-200/80 bg-white p-1">
                {SORTS.map((sort) => {
                  let icon: React.ReactNode;
                  if (sort === "Newest") {
                    icon = <SortDescending className="h-4 w-4" />;
                  } else if (sort === "Oldest") {
                    icon = <SortAscending className="h-4 w-4" />;
                  } else {
                    icon = <Heart className="h-4 w-4" />;
                  }

                  return (
                    <button
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-4 py-3 font-medium text-sm transition-all duration-300",
                        sortOption === sort
                          ? "bg-zinc-50 text-zinc-950"
                          : "text-zinc-500 hover:bg-zinc-50/50 hover:text-zinc-900"
                      )}
                      key={sort}
                      onClick={() => setSortOption(sort)}
                      type="button"
                    >
                      {icon}
                      {sort}
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          <div className="lg:col-span-9">
            {filteredTweets.length === 0 ? (
              <motion.div
                animate={{ opacity: 1, scale: 1 }}
                className="flex w-full flex-col items-center justify-center gap-6 rounded-[3rem] border border-zinc-200 border-dashed bg-white p-16 text-center"
                initial={{ opacity: 0, scale: 0.95 }}
              >
                <div className="flex h-20 w-20 items-center justify-center rounded-full border border-zinc-100 bg-zinc-50">
                  <MagnifyingGlass className="h-8 w-8 text-zinc-300" />
                </div>
                <div className="flex flex-col gap-2">
                  <h3 className="font-display font-semibold text-2xl text-zinc-950">
                    No tweets found
                  </h3>
                  <p className="mx-auto max-w-[30ch] text-zinc-500">
                    We couldn't find any tweets matching your current filters.
                    Try adjusting your search or categories.
                  </p>
                </div>
                <button
                  className="mt-4 flex items-center gap-2 rounded-full bg-zinc-100 px-6 py-3 font-medium text-sm text-zinc-950 transition-colors hover:bg-zinc-200"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedCategories([]);
                    setDateFilter("All Time");
                  }}
                  type="button"
                >
                  Clear all filters
                </button>
              </motion.div>
            ) : (
              <div className="flex items-start gap-6">
                {masonryColumns.map((column, colIndex) => {
                  const columnKey = column.map((t) => t.id).join("-");
                  return (
                    <div
                      className="flex flex-1 flex-col gap-6"
                      key={columnKey || `column-${colIndex}`}
                    >
                      <AnimatePresence mode="popLayout">
                        {column.map((tweet) => (
                          <TweetCard key={tweet.id} tweet={tweet} />
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
        {isMobileFiltersOpen && (
          <>
            <motion.div
              animate={{ opacity: 1 }}
              className="fixed inset-0 z-[60] bg-zinc-950/20 backdrop-blur-sm lg:hidden"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              onClick={() => setIsMobileFiltersOpen(false)}
            />
            <motion.div
              animate={{ y: 0 }}
              className="fixed right-0 bottom-0 left-0 z-[70] flex max-h-[85vh] flex-col gap-8 overflow-y-auto rounded-t-[2rem] bg-white p-6 pb-12 shadow-2xl lg:hidden"
              exit={{ y: "100%" }}
              initial={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display font-semibold text-2xl">Filters</h2>
                <button
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-500"
                  onClick={() => setIsMobileFiltersOpen(false)}
                  type="button"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="group relative">
                <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
                  <MagnifyingGlass className="h-5 w-5 text-zinc-400" />
                </div>
                <input
                  className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 py-4 pr-4 pl-12 text-sm transition-all focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tweets..."
                  type="text"
                  value={searchQuery}
                />
              </div>

              <div className="flex flex-col gap-4">
                <h3 className="font-bold text-xs text-zinc-400 uppercase tracking-widest">
                  Categories
                </h3>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((cat) => {
                    const isActive = selectedCategories.includes(cat);
                    return (
                      <button
                        className={cn(
                          "rounded-full border px-4 py-2 font-medium text-sm transition-all duration-300",
                          isActive
                            ? "border-zinc-950 bg-zinc-950 text-white"
                            : "border-zinc-200 bg-zinc-50 text-zinc-600"
                        )}
                        key={cat}
                        onClick={() => toggleCategory(cat)}
                        type="button"
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="flex flex-col gap-4">
                  <h3 className="font-bold text-xs text-zinc-400 uppercase tracking-widest">
                    Timeframe
                  </h3>
                  <div className="flex flex-col gap-2">
                    {DATES.map((date) => (
                      <button
                        className={cn(
                          "flex items-center justify-between rounded-xl border px-4 py-3 font-medium text-sm transition-all duration-300",
                          dateFilter === date
                            ? "border-zinc-300 bg-zinc-100 text-zinc-950"
                            : "border-transparent bg-transparent text-zinc-500"
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
                  <div className="flex flex-col gap-2">
                    {SORTS.map((sort) => (
                      <button
                        className={cn(
                          "flex items-center gap-3 rounded-xl border px-4 py-3 font-medium text-sm transition-all duration-300",
                          sortOption === sort
                            ? "border-zinc-300 bg-zinc-100 text-zinc-950"
                            : "border-transparent bg-transparent text-zinc-500"
                        )}
                        key={sort}
                        onClick={() => setSortOption(sort)}
                        type="button"
                      >
                        {sort}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

const MOCK_TWEETS: Tweet[] = [
  {
    id: 1,
    author: "Vercel",
    handle: "@vercel",
    content:
      "Next.js 14 is here. Faster local dev, partial prerendering, and more.",
    category: "Tech",
    date: subDays(new Date(), 1),
    likes: 4200,
    retweets: 890,
    replies: 120,
    image: "https://picsum.photos/seed/vercel/800/400",
  },
  {
    id: 2,
    author: "Figma",
    handle: "@figma",
    content: "Introducing Variables. A new way to design with logic.",
    category: "Design",
    date: subDays(new Date(), 5),
    likes: 8500,
    retweets: 1200,
    replies: 340,
    image: "https://picsum.photos/seed/figma/800/600",
  },
  {
    id: 3,
    author: "The Verge",
    handle: "@verge",
    content: "Apple announces the new Vision Pro headset.",
    category: "News",
    date: subDays(new Date(), 10),
    likes: 12_000,
    retweets: 3400,
    replies: 890,
    image: "https://picsum.photos/seed/vision/800/500",
  },
  {
    id: 4,
    author: "Netflix",
    handle: "@netflix",
    content: "Stranger Things Season 5 is in production.",
    category: "Entertainment",
    date: subDays(new Date(), 2),
    likes: 45_000,
    retweets: 8900,
    replies: 2100,
    image: "https://picsum.photos/seed/netflix/800/800",
  },
  {
    id: 5,
    author: "ESPN",
    handle: "@espn",
    content: "What a game! The finals go to game 7.",
    category: "Sports",
    date: subDays(new Date(), 0),
    likes: 32_000,
    retweets: 5600,
    replies: 1200,
    image: "https://picsum.photos/seed/espn/800/450",
  },
  {
    id: 6,
    author: "Stripe",
    handle: "@stripe",
    content: "We are rolling out a new checkout experience.",
    category: "Tech",
    date: subDays(new Date(), 15),
    likes: 3400,
    retweets: 450,
    replies: 89,
    image: null,
  },
  {
    id: 7,
    author: "Linear",
    handle: "@linear",
    content: "Linear Insights. A new way to visualize your team's progress.",
    category: "Design",
    date: subDays(new Date(), 3),
    likes: 5600,
    retweets: 670,
    replies: 140,
    image: "https://picsum.photos/seed/linear/800/600",
  },
  {
    id: 8,
    author: "OpenAI",
    handle: "@OpenAI",
    content:
      "GPT-4o is now available to all users. It is faster, smarter, and more capable than ever before.",
    category: "Tech",
    date: subDays(new Date(), 1),
    likes: 89_000,
    retweets: 12_000,
    replies: 4500,
    image: "https://picsum.photos/seed/openai/800/400",
  },
  {
    id: 9,
    author: "Astro",
    handle: "@astrodotbuild",
    content: "Astro 4.0 is live! The web framework for content-driven sites.",
    category: "Tech",
    date: subDays(new Date(), 20),
    likes: 4500,
    retweets: 890,
    replies: 120,
    image: "https://picsum.photos/seed/astro/800/500",
  },
];
