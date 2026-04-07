import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "motion/react": path.resolve("./src/test/motion-mock.tsx"),
      agentation: path.resolve("./src/test/agentation-mock.tsx"),
      "react-tweet/theme.css": path.resolve("./src/test/empty-css-mock.ts"),
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
    server: {
      deps: {
        inline: ["react-tweet"],
      },
    },
    // isolate:false + single worker: all test files share one module registry so
    // modules are imported once. Required to prevent per-file jsdom cold-start
    // overhead on low-end hardware. Tests maintain hygiene via afterEach(cleanup),
    // afterEach(vi.restoreAllMocks), and afterEach(vi.unstubAllGlobals). Avoid
    // module-level mutable singletons without an explicit reset mechanism.
    isolate: false,
    pool: "forks",
    maxWorkers: 1,
    testTimeout: 15_000,
  },
});
