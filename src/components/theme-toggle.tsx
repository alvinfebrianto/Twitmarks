"use client";

import { Moon, Sun } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "../lib/utils";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const html = document.documentElement;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem("theme");
    } catch {
      // localStorage may be unavailable
    }
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;

    const shouldBeDark = stored === "dark" || (!stored && prefersDark);
    setIsDark(shouldBeDark);

    if (shouldBeDark) {
      html.classList.add("dark");
    } else {
      html.classList.remove("dark");
    }
  }, []);

  const toggleTheme = () => {
    const html = document.documentElement;
    const newIsDark = !isDark;
    setIsDark(newIsDark);

    if (newIsDark) {
      html.classList.add("dark");
      try {
        localStorage.setItem("theme", "dark");
      } catch {
        // localStorage may be unavailable
      }
    } else {
      html.classList.remove("dark");
      try {
        localStorage.setItem("theme", "light");
      } catch {
        // localStorage may be unavailable
      }
    }
  };

  if (!mounted) {
    return (
      <button
        aria-label="Toggle theme"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
        disabled
        type="button"
      >
        <Sun aria-hidden="true" className="h-4 w-4" weight="regular" />
      </button>
    );
  }

  return (
    <motion.button
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "relative flex h-9 w-9 items-center justify-center rounded-full",
        "bg-zinc-100 text-zinc-500 transition-colors hover:bg-zinc-200",
        "dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
      )}
      onClick={toggleTheme}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      type="button"
      whileTap={{ scale: 0.95 }}
    >
      <motion.div
        animate={{
          rotate: isDark ? 180 : 0,
          scale: isDark ? 0 : 1,
        }}
        className="absolute"
        initial={false}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <Sun aria-hidden="true" className="h-4 w-4" weight="regular" />
      </motion.div>

      <motion.div
        animate={{
          rotate: isDark ? 0 : -180,
          scale: isDark ? 1 : 0,
        }}
        className="absolute"
        initial={false}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <Moon aria-hidden="true" className="h-4 w-4" weight="regular" />
      </motion.div>
    </motion.button>
  );
}
