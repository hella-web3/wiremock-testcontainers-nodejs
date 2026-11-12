import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as extensions from ".";

/**
 * Keeps the guide for extension authors honest: every TypeScript snippet names its source file in
 * its first line (`// extensions/jars.ts`) and must match it line for line – so each snippet is
 * type-checked and tested code – every link must resolve, and every export must be documented.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
/** The examples project: snippet paths are relative to it. */
const PROJECT = join(HERE, "..");
const GUIDE = readFileSync(join(HERE, "README.md"), "utf8");

/** The guide's TypeScript snippets: the file each names, and its remaining lines. */
const snippets = [...GUIDE.matchAll(/```typescript\n(.*?)```/gsu)].map(([, code], index) => {
  const [marker, ...lines] = code.trimEnd().split("\n");
  const file = /^\/\/ (\S+\.ts)$/u.exec(marker)?.[1];
  return { name: `snippet ${index + 1} (${file ?? "no file"})`, file, lines };
});

/** Whether `lines` occur, in order and unchanged, in `file`. */
const excerptOf = (file: string, lines: readonly string[]): boolean => {
  const source = readFileSync(join(PROJECT, file), "utf8").split("\n");
  return source.some((_, start) => lines.every((line, offset) => source[start + offset] === line));
};

/** GitHub's anchor for a heading: lower case, punctuation dropped, spaces as dashes. */
const anchor = (heading: string): string => heading.toLowerCase().replaceAll(/[^\p{L}\p{N} -]/gu, "").replaceAll(" ", "-");
const headings = new Set([...GUIDE.matchAll(/^#{2,} (.+)$/gmu)].map(([, heading]) => anchor(heading)));
const links = [...GUIDE.matchAll(/\]\(([^)\s]+)\)/gu)].map(([, target]) => target).filter((target) => !/^https?:/u.test(target));

describe("extensions/README.md – the guide for extension authors", () => {
  it("has snippets", () => {
    expect(snippets.length).toBeGreaterThan(10);
  });

  it.each(snippets)("$name names an existing source file in its first line", ({ file }) => {
    expect(file).toBeDefined();
    expect(existsSync(join(PROJECT, file ?? ""))).toBe(true);
  });

  it.each(snippets)("$name is an unchanged excerpt of that file", ({ file, lines }) => {
    expect(lines.length).toBeGreaterThan(0);
    expect(excerptOf(file ?? "", lines)).toBe(true);
  });

  it.each(links.filter((link) => !link.startsWith("#")))("links to an existing file: %s", (link) => {
    expect(existsSync(join(HERE, link.split("#")[0]))).toBe(true);
  });

  it.each(links.filter((link) => link.startsWith("#")))("links to an existing section: %s", (link) => {
    expect(headings).toContain(link.slice(1));
  });

  it.each(Object.keys(extensions))("documents the export %s", (name) => {
    expect(GUIDE).toContain(`\`${name}\``);
  });

  it.each(readdirSync(HERE).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts")))("links to %s", (file) => {
    expect(links).toContain(`./${file}`);
  });

  it("detects a snippet that drifted from its file", () => {
    expect(excerptOf("extensions/jars.ts", ['export const JAVA_PACKAGE = "com.acme";'])).toBe(false);
  });
});
