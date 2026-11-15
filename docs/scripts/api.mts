/**
 * `pnpm docs:api` (in docs/: `npm run api`) – generates the API reference into `docs/api/` with
 * TypeDoc, from the library's source in `../src`. Skipped when nothing TypeDoc reads has changed
 * since the last run; `--force` regenerates anyway. The source imports `testcontainers`, so the
 * library's own dependencies must be installed: `pnpm install` in the repository root.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { FINGERPRINT, fingerprint, isUpToDate } from "../src/lib/api-inputs.mts";
import { DOCS_ROOT, REPO_ROOT } from "../src/lib/site.mts";

const OUT = join(DOCS_ROOT, "docs", "api");
const inputs = {
  sourceDir: join(REPO_ROOT, "src"),
  files: ["typedoc.json", "tsconfig.typedoc.json", "src/lib/typedoc-descriptions.mts"].map((file) => join(DOCS_ROOT, file)),
  packages: ["typedoc", "typedoc-plugin-markdown", "typedoc-docusaurus-theme", "typescript"],
  modulesDir: join(DOCS_ROOT, "node_modules"),
};

if (!existsSync(join(REPO_ROOT, "node_modules", "testcontainers"))) {
  console.error('✖ The API reference is generated from the library\'s source, which needs its dependencies: run "pnpm install" in the repository root first.');
  process.exitCode = 1;
} else {
  const current = fingerprint(inputs);
  if (isUpToDate(OUT, current) && !process.argv.includes("--force")) {
    console.log("API reference up to date – docs/api/ (regenerate with --force)");
  } else {
    // TypeDoc's CLI, from its package.json: its exports do not include it.
    const manifest = createRequire(import.meta.url).resolve("typedoc/package.json");
    const { bin } = JSON.parse(readFileSync(manifest, "utf8")) as { bin: Record<string, string> };
    const status = spawnSync(process.execPath, [join(dirname(manifest), bin.typedoc ?? "bin/typedoc")], { cwd: DOCS_ROOT, stdio: "inherit" }).status ?? 1;
    if (status === 0) writeFileSync(join(OUT, FINGERPRINT), current);
    process.exitCode = status;
  }
}
