/**
 * `pnpm docs:sync:markdown [--check]` (in docs/: `npm run sync:markdown [-- --check]`) – rewrites the
 * snippet copies in Markdown rendered on GitHub and npm (README.md, …) from the examples.
 * `--check` only reports stale copies and fails.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SYNCED_MARKDOWN, syncMarkdown } from "../src/lib/markdown-sync.mts";
import { EXAMPLES_DIR, REPO_ROOT } from "../src/lib/site.mts";
import { readSnippet } from "../src/lib/snippets.mts";

const check = process.argv.includes("--check");
const stale = SYNCED_MARKDOWN.filter((file) => {
  const path = join(REPO_ROOT, file);
  const text = readFileSync(path, "utf8");
  const { text: synced } = syncMarkdown(text, (ref) => readSnippet(ref, EXAMPLES_DIR).code, file);
  if (synced === text) return false;
  if (!check) writeFileSync(path, synced);
  return true;
});

if (stale.length === 0) {
  console.log("Markdown snippets are in sync.");
} else if (check) {
  console.error(`Out-of-date snippets in ${stale.join(", ")} – run "pnpm docs:sync:markdown" (in docs/: "npm run sync:markdown").`);
  process.exitCode = 1;
} else {
  console.log(`Updated ${stale.join(", ")}.`);
}
