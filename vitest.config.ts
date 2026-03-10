import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "motion/react": path.resolve("./src/test/motion-mock.tsx"),
      agentation: path.resolve("./src/test/agentation-mock.tsx"),
    },
  },
  define: {
    "import.meta.env.DEV": JSON.stringify(false),
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    isolate: false,
    pool: "forks",
    maxWorkers: 1,
    minWorkers: 1,
    testTimeout: 15_000,
  },
});
