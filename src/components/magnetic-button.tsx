"use client";

import { motion, useMotionValue, useSpring } from "motion/react";
import type React from "react";
import { cn } from "../lib/utils";

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
