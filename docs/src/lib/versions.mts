/**
 * Versioned docs: one version per major of the library. The current docs document the current
 * major; `pnpm docs:version:cut` freezes them before a breaking release. A frozen copy must not
 * change with `main`, so its snippets are inlined and its source links pinned to a release tag.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPOSITORY_URL, sourceUrl } from "./site.mts";
import type { Snippet } from "./snippets.mts";

const FILE_META = /(?:^|\s)file=(\S+)/u;
const TITLE_META = /(?:^|\s)title=/u;
const OPENER = /^(\s*)(`{3,}|~{3,})(.*)$/u;

/** Inlines every `file=` snippet of an MDX document, with a source link pinned to `ref`. */
export function freezeDocument(text: string, read: (ref: string) => Snippet, ref: string, file = "document"): string {
  const lines = text.split("\n");
  const output: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const [, indent = "", fence = "", info = ""] = OPENER.exec(line) ?? [];
    const name = FILE_META.exec(info)?.[1];
    if (name === undefined) {
      output.push(line);
      continue;
    }
    const closing = lines.findIndex((candidate, at) => at > index && candidate.trim() === fence);
    if (closing === -1) throw new Error(`${file}:${index + 1}: the code block for "${name}" is never closed`);
    const snippet = read(name);
    const [first = "", ...others] = info.trim().split(/\s+/u);
    const [lang, tokens] = first.includes("=") ? ["", [first, ...others]] : [first, others];
    const rest = tokens.filter((token) => !token.startsWith("file=")).join(" ");
    const meta = TITLE_META.test(rest) ? rest : `title="examples/${snippet.file}" ${rest}`.trim();
    const url = sourceUrl(`examples/${snippet.file}`, ref, snippet.lines);
    output.push(
      `${indent}${fence}${lang} ${meta}`,
      ...snippet.code.split("\n").map((code) => (code === "" ? "" : `${indent}${code}`)),
      `${indent}${fence}`,
      "",
      `${indent}<p className="example-source">Source: <a href="${url}"><code>examples/${snippet.file}</code></a></p>`,
    );
    index = closing;
  }
  return output.join("\n");
}

const escape = (text: string): string => text.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/** Points links to the repository's `main` branch at `ref` instead. */
export const pinSourceLinks = (text: string, ref: string): string =>
  text.replaceAll(new RegExp(`${escape(REPOSITORY_URL)}/(blob|tree|edit)/main/`, "gu"), `${REPOSITORY_URL}/$1/${ref}/`);

/** The Markdown and MDX files below `dir`. */
export function documentsIn(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return documentsIn(path);
    return /\.mdx?$/u.test(entry) ? [path] : [];
  });
}

/** Freezes every document of a versioned copy of the docs; returns the files changed. */
export function freezeVersion(dir: string, read: (ref: string) => Snippet, ref: string): string[] {
  return documentsIn(dir).filter((path) => {
    const text = readFileSync(path, "utf8");
    const frozen = pinSourceLinks(freezeDocument(text, read, ref, path), ref);
    if (frozen === text) return false;
    writeFileSync(path, frozen);
    return true;
  });
}

/** The versions `docusaurus docs:version` cut, newest first – none without `versions.json`. */
export function cutVersions(docsRoot: string): string[] {
  const file = join(docsRoot, "versions.json");
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as string[]) : [];
}

/** Whether `version` is a pre-release of a new major, e.g. `1.0.0-next.2` – a major in development. */
export const isNextMajor = (version: string): boolean => /^\d+\.0\.0-/u.test(version);

/** How the site presents the current docs and the cut versions. */
export interface DocsVersions {
  /** The version shown at `/docs`: `"current"`, or the newest cut version while the next major is in development. */
  readonly lastVersion: string;
  /** The current docs: their label, path below `/docs` (`""` or `"next"`) and banner. */
  readonly current: { readonly label: string; readonly path: string; readonly banner: "none" | "unreleased" };
}

/**
 * The current docs document the library's current major. While it is a pre-release of a new
 * major – `1.0.0-next.0` – the latest released major stays the default at `/docs`, and the current
 * docs move to `/docs/next`, labelled `1.x (next)` with an "unreleased" banner. Releasing `1.0.0`
 * makes them the default again.
 */
export function docsVersions(version: string, versions: readonly string[]): DocsVersions {
  const label = `${version.split(".")[0]}.x`;
  const [latest] = versions;
  if (isNextMajor(version) && latest !== undefined) {
    return { lastVersion: latest, current: { label: `${label} (next)`, path: "next", banner: "unreleased" } };
  }
  return { lastVersion: "current", current: { label, path: "", banner: "none" } };
}

/**
 * What is wrong with the cut versions for the library's `version`: the current major must not be
 * cut yet, every cut version must be an older major, and once the library is past 0.x the
 * previous major must have been cut – its users keep their docs through the breaking change.
 */
export function versionProblems(version: string, versions: readonly string[]): string[] {
  const major = Number(version.split(".")[0]);
  const problems: string[] = [];
  for (const label of versions) {
    const cut = /^(\d+)\.x$/u.exec(label);
    if (!cut) problems.push(`"${label}" is not a major version label such as "1.x"`);
    else if (Number(cut[1]) >= major) {
      problems.push(
        `"${label}" is cut, but the library is still at ${version}: open the next major in the same change – ` +
          `"npm version premajor --preid next --no-git-tag-version" (see release.md)`,
      );
    }
  }
  const previous = `${major - 1}.x`;
  if (major > 0 && !versions.includes(previous)) {
    problems.push(
      `the library is at ${version} but the ${previous} docs were not kept: run "pnpm docs:version:cut ${previous} --ref <last ${previous} tag>" (in docs/: "npm run version:cut -- ${previous} --ref …")`,
    );
  }
  return problems;
}
