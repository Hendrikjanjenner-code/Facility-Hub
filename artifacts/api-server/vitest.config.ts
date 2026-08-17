import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 15000,
    // Run tests sequentially to avoid DB contention between test files
    pool: "forks",
    singleFork: true,
  },
});
