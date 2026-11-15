import { defineConfig } from "vitest/config";

/**
 * - `unit` – `test/unit/**`: the tooling in `src/lib` (100 % coverage) and the sync checks between
 *   the docs, the examples and the library. No build needed. Not isolated: the tests share no
 *   mutable state, and reusing workers loads TypeScript and the MDX toolchain once instead of once
 *   per file – a third of the suite's time.
 * - `e2e` – `test/e2e/**`: serves the built site like GitHub Pages does and checks its pages,
 *   snippets and links. `pnpm docs:test:e2e` builds the site first.
 */
export default defineConfig({
  test: {
    environment: "node",
    projects: [
      { extends: true, test: { name: "unit", include: ["test/unit/**/*.test.ts"], testTimeout: 60_000, isolate: false } },
      { extends: true, test: { name: "e2e", include: ["test/e2e/**/*.test.ts"], testTimeout: 60_000, hookTimeout: 60_000 } },
    ],
    coverage: {
      provider: "v8",
      include: ["src/lib/**"],
      reporter: ["text", "json-summary"],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
