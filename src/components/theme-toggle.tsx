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
    const stored = localStorage.getItem("theme");
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
      localStorage.setItem("theme", "dark");
    } else {
      html.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleTheme();
    }
  };

  if (!mounted) {
    return (
      <button
        aria-label="Toggle theme"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition-colors hover:bg-zinc-200"
        disabled
        type="button"
      >
        <Sun aria-hidden="true" className="h-5 w-5" weight="regular" />
      </button>
    );
  }

  return (
    <motion.button
      animate={{ scale: 1 }}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "relative flex h-10 w-10 items-center justify-center rounded-full",
        "bg-zinc-100 text-zinc-500 transition-colors hover:bg-zinc-200",
        "dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
      )}
      exit={{ scale: 0.95 }}
      initial={{ scale: 0.95 }}
      onClick={toggleTheme}
      onKeyDown={handleKeyDown}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
      type="button"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <motion.div
        animate={{
          rotate: isDark ? 180 : 0,
          scale: isDark ? 0 : 1,
        }}
        className="absolute"
        initial={{ rotate: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      >
        <Sun aria-hidden="true" className="h-5 w-5" weight="regular" />
      </motion.div>

      <motion.div
        animate={{
          rotate: isDark ? 0 : -180,
          scale: isDark ? 1 : 0,
        }}
        className="absolute"
        initial={{ rotate: -180, scale: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      >
        <Moon aria-hidden="true" className="h-5 w-5" weight="regular" />
      </motion.div>
    </motion.button>
  );
}
