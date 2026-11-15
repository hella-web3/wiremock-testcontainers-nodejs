/**
 * `pnpm docs:version:cut [<label>] [--ref <git ref>]` (in docs/: `npm run version:cut -- …`) –
 * freezes the current docs as a version when the next major opens, before the first breaking change
 * touches them (release.md → Major releases):
 *
 * 1. regenerates the API reference from the library's current source;
 * 2. snapshots docs and sidebars with `docusaurus docs:version <label>`;
 * 3. freezes the snapshot: inlines every example snippet and pins links to `main` to `<ref>`.
 *
 * Defaults: the label of the library's version (`0.x` for 0.4.1) and its release tag (`v0.4.1`).
 * Then open the next major in the same change: `npm version premajor --preid next --no-git-tag-version`.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { DOCS_ROOT, EXAMPLES_DIR, libraryVersion, VERSIONED_DIR, versionLabel } from "../src/lib/site.mts";
import { readSnippet } from "../src/lib/snippets.mts";
import { cutVersions, freezeVersion, isNextMajor } from "../src/lib/versions.mts";

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args.splice(at, 2)[1];
};
const version = libraryVersion();
const explicitRef = option("--ref");
const ref = explicitRef ?? `v${version}`;
const [label = versionLabel(version)] = args;

const run = (command: string, ...commandArgs: string[]): void => {
  const { status } = spawnSync(command, commandArgs, { cwd: DOCS_ROOT, stdio: "inherit", shell: process.platform === "win32" });
  if (status !== 0) throw new Error(`${command} ${commandArgs.join(" ")} failed with exit code ${status}`);
};

if (isNextMajor(version) && (args.length === 0 || explicitRef === undefined)) {
  throw new Error(`the library is at ${version}, a pre-release of the next major: its docs are unreleased – cut the previous major explicitly, e.g. "pnpm docs:version:cut 0.x --ref v0.4.1"`);
}
if (!/^\d+\.x$/u.test(label)) throw new Error(`"${label}" is not a major version label such as "1.x"`);
if (cutVersions(DOCS_ROOT).includes(label)) throw new Error(`version ${label} is already cut – see versions.json`);

run("npm", "run", "api");
run("npx", "docusaurus", "docs:version", label);
const frozen = freezeVersion(join(VERSIONED_DIR, `version-${label}`), (name) => readSnippet(name, EXAMPLES_DIR), ref);

console.log(`
Froze the ${label} docs in versioned_docs/version-${label}: ${frozen.length} documents inlined snippets or pinned links to ${ref}.
Next, in the same change:
  1. open the next major:   npm version premajor --preid next --no-git-tag-version
  2. commit versions.json, versioned_docs/, versioned_sidebars/ and package.json
Then update the current docs – now at /docs/next – with the breaking changes (release.md).`);
