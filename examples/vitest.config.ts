import { defineConfig } from "vitest/config";

/**
 * `e2e/` – end-to-end flows against WireMock, with generous timeouts for a cold image pull – and
 * `extensions/` – unit tests of the example extensions, no container needed. With `--no-docker`,
 * `scripts/test-e2e.mjs` sets `WIREMOCK_NO_DOCKER=1` and the setup file below serves WireMock
 * from a local JVM.
 *
 * Coverage (`npm run test:unit`) covers the example extensions and is enforced at 100 %: they are
 * what authors copy, so every line is exercised without a container.
 */
const noDocker = process.env.WIREMOCK_NO_DOCKER === "1";

export default defineConfig({
  test: {
    environment: "node",
    include: ["e2e/**/*.test.ts", "extensions/**/*.test.ts"],
    setupFiles: noDocker ? ["./e2e/no-docker.setup.ts"] : [],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    coverage: {
      provider: "v8",
      include: ["extensions/**/*.ts"],
      exclude: ["extensions/**/*.test.ts"],
      reporter: ["text", "json-summary"],
      thresholds: { perFile: true, statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
