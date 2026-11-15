/**
 * The docs and the examples, kept in sync: every snippet on the site comes from an example that
 * exists, every example links to the page that shows it, and nothing is left unused.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { codeBlocks, docPages, exampleFiles, linksOf, pageOf, read, seeLinks } from "../../src/lib/content.mts";
import { SYNCED_MARKDOWN, syncMarkdown } from "../../src/lib/markdown-sync.mts";
import { snippetRefOf } from "../../src/lib/remark-example-snippets.mts";
import { CONTENT_DIR, DOCS_ROOT, DOCS_URL, EXAMPLES_DIR, libraryVersion, REPO_ROOT, REPOSITORY_URL } from "../../src/lib/site.mts";
import { parseRef, readSnippet, regionsOf } from "../../src/lib/snippets.mts";
import { cutVersions, versionProblems } from "../../src/lib/versions.mts";

/** Code that must come from an example: anything a reader could copy and run. */
const CODE_LANGUAGES = new Set(["ts", "tsx", "typescript", "js", "jsx", "javascript", "mjs", "cjs", "json"]);

const pages = docPages(CONTENT_DIR).map((page) => ({ page, text: read(join(CONTENT_DIR, page)) }));
const refsOf = (text: string): string[] => codeBlocks(text).flatMap(({ meta }) => snippetRefOf(meta) ?? []);
/** The partials a page imports, e.g. `import X from "../_partials/x.mdx"` → `_partials/x.mdx`. */
const partialsOf = (text: string): string[] => [...text.matchAll(/^import \w+ from "(?:\.\.?\/)+(_partials\/[\w-]+\.mdx)";$/gmu)].map(([, partial]) => partial as string);
/** Snippet references: page → refs embedded by it, directly or through partials. */
const embedded = pages.map(({ page, text }) => ({
  page,
  refs: [...refsOf(text), ...partialsOf(text).flatMap((partial) => refsOf(read(join(CONTENT_DIR, partial))))],
}));
const allRefs = embedded.flatMap(({ page, refs }) => refs.map((ref) => ({ page, ref })));
const synced = SYNCED_MARKDOWN.map((file) => ({ file, text: read(join(REPO_ROOT, file)) }));
const syncedRefs = synced.flatMap(({ file, text }) => syncMarkdown(text, () => "", file).refs);
/** The directory of an example file: the task it belongs to. */
const folderOf = (file: string): string => file.split("/").slice(0, -1).join("/");
const examples = exampleFiles(EXAMPLES_DIR).map((file) => ({ file, text: read(join(EXAMPLES_DIR, file)) }));

describe("docs pages", () => {
  it("exist, and embed examples", () => {
    expect(pages.length).toBeGreaterThan(15);
    expect(allRefs.length).toBeGreaterThan(80);
  });

  it.each(allRefs)("$page embeds $ref, which exists", ({ ref }) => {
    expect(() => readSnippet(ref, EXAMPLES_DIR)).not.toThrow();
  });

  it.each(pages)("$page has no hand-written code: TypeScript, JavaScript and JSON come from examples", ({ text }) => {
    const inline = codeBlocks(text).filter(({ lang, meta }) => CODE_LANGUAGES.has(lang ?? "") && snippetRefOf(meta) === undefined);
    expect(inline.map(({ value }) => value)).toEqual([]);
  });

  it.each(pages)("$page links only to files of the repository that exist", ({ text }) => {
    const prefix = new RegExp(`^${REPOSITORY_URL}/(?:blob|tree)/main/([^#?]+)`, "u");
    const paths = linksOf(text).flatMap((url) => prefix.exec(url)?.[1] ?? []);
    expect(paths.filter((path) => !existsSync(join(REPO_ROOT, path)))).toEqual([]);
  });
});

describe("examples", () => {
  it.each(examples)("$file links to the docs page showing its folder", ({ file, text }) => {
    const [page] = seeLinks(text, DOCS_URL);
    expect(page, `add "@see ${DOCS_URL}<page>" to its header comment`).toBeDefined();
    const source = pageOf(page ?? "", CONTENT_DIR);
    expect(source, `${DOCS_URL}${page} has no page in docs/docs`).toBeDefined();
    const refs = embedded.find(({ page: candidate }) => candidate === source)?.refs ?? [];
    expect(refs.map((ref) => folderOf(parseRef(ref).file))).toContain(folderOf(file));
  });

  it("every example module is shown in the docs – tests of helpers may only be linked", () => {
    const shown = new Set(allRefs.map(({ ref }) => parseRef(ref).file));
    const modules = examples.filter(({ file }) => !file.endsWith(".test.ts") || file.endsWith(".e2e.test.ts"));
    expect(modules.map(({ file }) => file).filter((file) => !shown.has(file))).toEqual([]);
  });

  it.each(examples.filter(({ text }) => regionsOf(text).size > 0))("$file: every region is shown in the docs", ({ file, text }) => {
    const used = new Set([...allRefs.map(({ ref }) => ref), ...syncedRefs]);
    const unused = [...regionsOf(text, file).keys()].filter((region) => !used.has(`${file}#${region}`));
    expect(unused).toEqual([]);
  });
});

describe("Markdown rendered on GitHub and npm", () => {
  it.each(synced)("$file: its snippets are in sync – run `pnpm docs:sync:markdown`", ({ file, text }) => {
    expect(syncMarkdown(text, (ref) => readSnippet(ref, EXAMPLES_DIR).code, file).text).toBe(text);
  });

  it("the README shows the quick start", () => {
    expect(syncedRefs).toContain("getting-started/quick-start.e2e.test.ts#quick-start");
  });
});

describe("versions", () => {
  it("keep the docs of every previous major version", () => {
    expect(versionProblems(libraryVersion(), cutVersions(DOCS_ROOT))).toEqual([]);
  });

  it.each(cutVersions(DOCS_ROOT))("%s is frozen: no snippet follows main", (label) => {
    const dir = join(DOCS_ROOT, "versioned_docs", `version-${label}`);
    const refs = docPages(dir).flatMap((page) => codeBlocks(read(join(dir, page))).flatMap(({ meta }) => snippetRefOf(meta) ?? []));
    expect(refs).toEqual([]);
  });
});
