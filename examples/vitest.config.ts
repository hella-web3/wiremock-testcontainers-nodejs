import { defineConfig } from "vitest/config";

/**
 * E2E only – generous timeouts cover a cold image pull. With `--no-docker`,
 * `scripts/test-e2e.mjs` sets `WIREMOCK_NO_DOCKER=1` and the setup file below serves WireMock
 * from a local JVM.
 */
const noDocker = process.env.WIREMOCK_NO_DOCKER === "1";

export default defineConfig({
  test: {
    environment: "node",
    include: ["e2e/**/*.test.ts"],
    setupFiles: noDocker ? ["./e2e/no-docker.setup.ts"] : [],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
