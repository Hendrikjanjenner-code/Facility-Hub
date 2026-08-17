import { defineConfig } from "vitest/config";

// Hardcode the pnpm-installed zod path so vitest can resolve `zod/v4`.
// api-server does not declare zod as a direct dependency, but api-zod
// (a workspace dep) imports from 'zod/v4'. This alias bridges the gap.
const ZOD_V4 =
  "/home/runner/workspace/node_modules/.pnpm/zod@3.25.76/node_modules/zod/v4";

export default defineConfig({
  resolve: {
    alias: {
      "zod/v4": ZOD_V4,
    },
  },
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
