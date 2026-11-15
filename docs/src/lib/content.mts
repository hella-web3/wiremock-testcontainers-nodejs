/**
 * Reading the docs and the examples: their documents, code blocks, links and source files.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { Code, Link, Root } from "mdast";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";

/** Files below `dir` matching `pattern`, skipping the directories in `skip`; `/`-separated, relative to `dir`. */
export function filesIn(dir: string, pattern: RegExp, skip: readonly string[] = []): string[] {
  const walk = (current: string): string[] =>
    readdirSync(current).flatMap((entry) => {
      const path = join(current, entry);
      if (statSync(path).isDirectory()) return skip.includes(entry) ? [] : walk(path);
      return pattern.test(entry) ? [relative(dir, path).split(sep).join("/")] : [];
    });
  return walk(dir).toSorted();
}

/** Directories of the examples project that hold no example code. */
export const NOT_EXAMPLES = ["node_modules", "coverage", "packages", "__mocks__"];

/** The examples project's source files – TypeScript and JavaScript modules. */
export const exampleFiles = (examplesDir: string): string[] => filesIn(examplesDir, /\.(?:ts|mts|mjs)$/u, NOT_EXAMPLES);

/** The hand-written docs pages – not the generated API reference. */
export const docPages = (contentDir: string): string[] => filesIn(contentDir, /\.mdx?$/u, ["api"]);

const parser = unified().use(remarkParse).use(remarkMdx);

/** The parsed MDX document. */
export const parseMdx = (text: string): Root => parser.parse(text);

/** The code blocks of an MDX document. */
export function codeBlocks(text: string): Code[] {
  const blocks: Code[] = [];
  visit(parseMdx(text), "code", (node: Code) => {
    blocks.push(node);
  });
  return blocks;
}

/** The link targets of an MDX document. */
export function linksOf(text: string): string[] {
  const links: string[] = [];
  visit(parseMdx(text), "link", (node: Link) => {
    links.push(node.url);
  });
  return links;
}

/** The `@see` docs links of a source file, e.g. `@see https://…/docs/guides/x` → `guides/x`. */
export function seeLinks(source: string, docsUrl: string): string[] {
  const pattern = new RegExp(`@see (?:\\{@link )?${docsUrl.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&")}([^\\s}|]*)`, "gu");
  return [...source.matchAll(pattern)].map(([, page]) => page as string);
}

/** The page a docs path such as `guides/x#anchor` names: `guides/x.mdx` (or `.md`), if it exists. */
export function pageOf(path: string, contentDir: string): string | undefined {
  const [page = ""] = path.split("#");
  const candidates = [`${page}.mdx`, `${page}.md`, `${page}/index.mdx`, `${page}/index.md`];
  return candidates.find((candidate) => {
    try {
      return statSync(join(contentDir, candidate)).isFile();
    } catch {
      return false;
    }
  });
}

/** `readFileSync(path, "utf8")`. */
export const read = (path: string): string => readFileSync(path, "utf8");
