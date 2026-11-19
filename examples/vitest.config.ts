import { isNoDockerRequested } from "@hellaweb3/wiremock-testcontainers-nodejs";
import { defineConfig } from "vitest/config";

/**
 * Two projects, one per kind of test:
 *
 * - `unit` – `**\/*.test.ts`: no container. Coverage (`npm run test:unit`) covers every example
 *   module and is enforced at 100 % per file: the modules are what readers copy from the docs.
 * - `e2e` – `**\/*.e2e.test.ts`: against a real WireMock, with timeouts generous enough for a cold
 *   image pull. With `--no-docker`, `scripts/test-e2e.mjs` sets `WIREMOCK_NO_DOCKER=1`, so the
 *   setup file serves WireMock from a local JVM and the `no-docker/` suite joins in.
 *
 * @see https://hella-labs.github.io/wiremock-testcontainers-nodejs/docs/guides/running-without-docker
 */
// #region no-docker
const noDocker = isNoDockerRequested(); // WIREMOCK_NO_DOCKER is "1" or "true"
// #endregion no-docker

const SHARED = ["node_modules/**", "packages/**"];

export default defineConfig({
  test: {
    environment: "node",
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["**/*.test.ts"],
          exclude: [...SHARED, "**/*.e2e.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "e2e",
          include: ["**/*.e2e.test.ts"],
          // The JVM-specific checks only make sense – and only run – without Docker.
          exclude: [...SHARED, ...(noDocker ? [] : ["no-docker/**"])],
          // #region setup-files
          setupFiles: noDocker ? ["./no-docker/no-docker.setup.ts"] : [],
          // #endregion setup-files
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["**/*.ts"],
      exclude: [...SHARED, "**/*.test.ts", "**/*.setup.ts", "*.config.ts", "coverage/**"],
      reporter: ["text", "json-summary"],
      thresholds: { perFile: true, statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
