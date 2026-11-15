#!/usr/bin/env node
/**
 * `git diff --name-only <base>...HEAD | node scripts/check-docs-updated.mjs [--labels a,b]`
 *
 * Part of the definition of done (CONTRIBUTING.md): a change to the library's source comes with
 * the docs or examples that document it. Fails when `src/` changed but neither `docs/` nor
 * `examples/` did – unless the pull request carries the `no-docs-needed` label, for changes
 * users cannot observe (refactorings, internal fixes).
 */
import { readFileSync } from "node:fs";

export const LABEL = "no-docs-needed";
const SOURCE = /^src\//u;
const DOCUMENTATION = /^(?:docs|examples)\//u;

/** Whether `files` (repository paths) and `labels` satisfy the rule, and why. */
export function verdict(files, labels) {
  const source = files.filter((file) => SOURCE.test(file));
  if (source.length === 0) return { ok: true, message: "No library source changed." };
  if (files.some((file) => DOCUMENTATION.test(file))) return { ok: true, message: "Library source changed together with docs or examples." };
  if (labels.includes(LABEL)) return { ok: true, message: `Library source changed without docs or examples – accepted by the "${LABEL}" label.` };
  return {
    ok: false,
    message:
      `Library source changed (${source.join(", ")}) but neither docs/ nor examples/ did. ` +
      `Update the docs and examples (CONTRIBUTING.md → Definition of done), or label the pull request "${LABEL}" if users cannot observe the change.`,
  };
}

function main() {
  const at = process.argv.indexOf("--labels");
  const labels = at === -1 ? [] : (process.argv[at + 1] ?? "").split(",").map((label) => label.trim()).filter(Boolean);
  const files = readFileSync(0, "utf8").split("\n").map((line) => line.trim()).filter(Boolean);
  const { ok, message } = verdict(files, labels);
  (ok ? console.log : console.error)(message);
  process.exitCode = ok ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
