import { defineConfig } from "vitest/config";

/**
 * - `pnpm test:unit` → `test/unit/**`, no Docker.
 * - `pnpm test:e2e`  → `test/index.test.ts` in Docker; with `--no-docker`, `scripts/test-e2e.mjs`
 *   sets `WIREMOCK_NO_DOCKER=1` and the setup file below serves WireMock from a local JVM.
 *
 * Coverage covers `src/` only and is enforced at 95 %.
 */
const noDocker = process.env.WIREMOCK_NO_DOCKER === "1";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: noDocker ? ["./test/harness/no-docker.setup.ts"] : [],
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
