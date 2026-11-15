import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The repository's own Markdown – README, CONTRIBUTING, release.md, the projects' READMEs and the
 * pull request template – links to files and sections of each other: each must exist. (The docs
 * site checks its own pages at build time.)
 */
const FILES = ["README.md", "CONTRIBUTING.md", "release.md", "ROADMAP.md", "docs/README.md", "examples/README.md", "examples/extensions/README.md", ".github/pull_request_template.md"];

/** GitHub's anchor for a heading: lower case, punctuation dropped, spaces as dashes. */
const anchor = (heading: string): string =>
  heading.toLowerCase().replaceAll(/[^\p{L}\p{N} _-]/gu, "").replaceAll(" ", "-");

const anchorsOf = (file: string): Set<string> =>
  new Set([...readFileSync(file, "utf8").matchAll(/^#{1,6} (.+)$/gmu)].map(([, heading]) => anchor(heading ?? "")));

const links = FILES.flatMap((file) =>
  [...readFileSync(file, "utf8").matchAll(/\]\(([^)\s]+)\)/gu)]
    .map(([, target]) => target ?? "")
    .filter((target) => !/^[a-z]+:/u.test(target))
    .map((target) => ({ file, target })),
);

describe("links in the repository's Markdown", () => {
  it("are found", () => {
    expect(links.length).toBeGreaterThan(40);
  });

  it.each(links)("$file → $target", ({ file, target }) => {
    const [path = "", section] = target.split("#");
    const resolved = path === "" ? file : normalize(join(dirname(file), path));
    expect(existsSync(resolved), `${resolved} does not exist`).toBe(true);
    const sections = section !== undefined && resolved.endsWith(".md") && statSync(resolved).isFile() ? [section] : [];
    expect(sections.filter((name) => !anchorsOf(resolved).has(name)), `missing sections in ${resolved}`).toEqual([]);
  });
});
