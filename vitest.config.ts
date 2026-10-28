import { defineConfig } from "vitest/config";

/**
 * Test runner configuration.
 *
 * - `pnpm test:unit` → `test/unit/**`   (no Docker required)
 * - `pnpm test:e2e`  → `test/index.test.ts` (starts a real WireMock container)
 *
 * Coverage is measured on `src/` only and enforced at 95 %.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["src/**"],
      reporter: ["text", "lcov", "json-summary"],
      thresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
    },
  },
});
