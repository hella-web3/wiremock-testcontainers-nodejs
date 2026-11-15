#!/usr/bin/env node
/**
 * `pnpm docs:<script> [args…]` – runs `npm run <script> [args…]` in `docs/`.
 *
 * The docs are an npm project of their own; every docs task is a script in `docs/package.json`.
 * From the repository root, `pnpm docs:<script>` runs the script of the same name – `pnpm docs:start`
 * is `cd docs && npm run start`, `pnpm docs:check` is `cd docs && npm run check`. First it installs
 * `docs/` – with `npm ci`, which never rewrites the lockfile – if its dependencies are missing or
 * older than its lockfile.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PREFIX = "docs:";

/** The docs script a run asks for: `start` of `pnpm docs:start`, else the first argument. */
export function scriptOf(event, args) {
  if (event?.startsWith(PREFIX)) return { script: event.slice(PREFIX.length), args };
  const [script, ...rest] = args;
  return { script, args: rest };
}

/** Whether `docs/` must be installed: no dependencies yet, or a lockfile newer than them. */
export function needsInstall(docsDir) {
  const installed = join(docsDir, "node_modules", ".package-lock.json");
  if (!existsSync(installed)) return true;
  return statSync(join(docsDir, "package-lock.json")).mtimeMs > statSync(installed).mtimeMs;
}

/** Runs a command in `cwd`; returns its exit code. */
const run = (command, args, cwd) =>
  spawnSync(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" }).status ?? 1;

function main() {
  const docsDir = join(ROOT, "docs");
  const { script, args } = scriptOf(process.env.npm_lifecycle_event, process.argv.slice(2));
  const scripts = JSON.parse(readFileSync(join(docsDir, "package.json"), "utf8")).scripts;
  if (!script || !(script in scripts)) {
    console.error(`✖ docs/package.json has no script "${script ?? ""}". Available: ${Object.keys(scripts).map((name) => `pnpm docs:${name}`).join(", ")}`);
    return 1;
  }
  if (!existsSync(join(ROOT, "node_modules"))) {
    console.error('✖ The docs read the library\'s source, which needs its dependencies: run "pnpm install" first.');
    return 1;
  }
  if (needsInstall(docsDir)) {
    console.log("Installing the docs project (docs/) with npm ci…");
    const status = run("npm", ["ci", "--no-audit", "--no-fund"], docsDir);
    if (status !== 0) return status;
  }
  // `pnpm docs:sync:markdown -- --check` forwards the "--": npm must see it only once.
  const forwarded = args[0] === "--" ? args.slice(1) : args;
  return run("npm", ["run", script, ...(forwarded.length > 0 ? ["--", ...forwarded] : [])], docsDir);
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = main();
