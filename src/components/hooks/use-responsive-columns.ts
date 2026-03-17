"use client";

import { useEffect, useState } from "react";

export function useResponsiveColumns() {
  const [cols, setCols] = useState(3);

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

  return cols;
}
