import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Run each test file in isolation so module mocks don't bleed across files
    isolate: true,
    testTimeout: 15000,
    // Run tests sequentially to avoid DB contention between test files
    pool: "forks",
    singleFork: true,
  },
});
