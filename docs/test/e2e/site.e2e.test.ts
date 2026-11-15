/**
 * The built site, served the way GitHub Pages serves it: every page renders, every embedded
 * snippet links to the right lines of its example, and every docs URL used anywhere in the
 * repository – JSDoc, READMEs, examples – resolves, anchors included. `pnpm docs:test:e2e` builds
 * the site first.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { publicApi } from "../../src/lib/api-surface.mts";
import { codeBlocks, docPages, filesIn, read } from "../../src/lib/content.mts";
import { snippetRefOf } from "../../src/lib/remark-example-snippets.mts";
import { BASE_URL, CONTENT_DIR, DOCS_ROOT, DOCS_URL, EXAMPLES_DIR, libraryVersion, REPO_ROOT, SITE_URL, sourceUrl } from "../../src/lib/site.mts";
import { readSnippet } from "../../src/lib/snippets.mts";
import { cutVersions, docsVersions } from "../../src/lib/versions.mts";
import { serve } from "./server.ts";

const BUILD = join(DOCS_ROOT, "build");
/** Where the current docs are: `docs`, or `docs/next` while the next major is in development. */
const { current } = docsVersions(libraryVersion(), cutVersions(DOCS_ROOT));
const CURRENT = current.path ? `docs/${current.path}` : "docs";
let site: Awaited<ReturnType<typeof serve>>;

beforeAll(async () => {
  if (!existsSync(join(BUILD, "index.html"))) throw new Error('no built site in docs/build – run "pnpm docs:test:e2e", which builds it first');
  site = await serve(BUILD, BASE_URL);
});

afterAll(async () => {
  await site?.close();
});

/** Fetches a site path (below the base URL), e.g. `docs/guides/file-sources`. */
async function page(path: string): Promise<{ status: number; html: string }> {
  const response = await fetch(`${site.origin}${BASE_URL}${path}`);
  return { status: response.status, html: await response.text() };
}

/** The route of a docs page file, e.g. `guides/x.mdx` → `docs/guides/x`, or its `slug`. */
function routeOf(file: string): string {
  const slug = /^slug: (\/\S*)$/mu.exec(read(join(CONTENT_DIR, file)))?.[1];
  if (slug !== undefined) return `${CURRENT}${slug}`.replace(/\/$/u, "");
  return `${CURRENT}/${file.replace(/\.mdx?$/u, "").replace(/\/index$/u, "")}`;
}

/** The links of a page to the repository on GitHub. */
const sourceLinks = (html: string): string[] =>
  [...html.matchAll(/href="?(https:\/\/github\.com\/[^\s">]+)/gu)].map(([, url]) => (url ?? "").replaceAll("&amp;", "&"));

describe("the built site", () => {
  it("serves the home page, with the quick start", async () => {
    const { status, html } = await page("");
    expect(status).toBe(200);
    expect(html).toContain("WireMock Testcontainers for Node.js");
    const { lines } = readSnippet("getting-started/quick-start.e2e.test.ts#quick-start", EXAMPLES_DIR);
    expect(sourceLinks(html)).toContain(sourceUrl("examples/getting-started/quick-start.e2e.test.ts", "main", lines));
  });

  it("answers unknown pages with 404", async () => {
    expect((await page("docs/no-such-page")).status).toBe(404);
  });

  it("serves every page of its sitemap", async () => {
    const sitemap = read(join(BUILD, "sitemap.xml"));
    const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gu)].map(([, url]) => (url ?? "").slice(`${SITE_URL}${BASE_URL}`.length));
    expect(paths.length).toBeGreaterThan(30);
    const statuses = await Promise.all(paths.map(async (path) => [path, (await page(path)).status] as const));
    expect(statuses.filter(([, status]) => status !== 200)).toEqual([]);
  });
});

describe("guides", () => {
  const pages = docPages(CONTENT_DIR).filter((file) => !file.startsWith("_"));

  it.each(pages)("%s renders each of its snippets with a link to its lines", async (file) => {
    const { status, html } = await page(routeOf(file));
    expect(status).toBe(200);
    const refs = codeBlocks(read(join(CONTENT_DIR, file))).flatMap(({ meta }) => snippetRefOf(meta) ?? []);
    const expected = refs.map((ref) => readSnippet(ref, EXAMPLES_DIR)).map((snippet) => sourceUrl(`examples/${snippet.file}`, "main", snippet.lines));
    expect(sourceLinks(html)).toEqual(expect.arrayContaining(expected));
  });
});

describe("the API reference", () => {
  const directories = { class: "classes", function: "functions", variable: "variables", interface: "interfaces", type: "type-aliases" } as const;
  const exports = publicApi(join(REPO_ROOT, "src", "index.ts")).filter(({ kind }) => kind !== "member");

  it.each(exports)("documents $id on its own page", async ({ id, kind }) => {
    const { status, html } = await page(`${CURRENT}/api/${directories[kind as keyof typeof directories]}/${id}`);
    expect(status).toBe(200);
    expect(html).toContain(id);
  });
});

describe("docs URLs used across the repository", () => {
  // A URL followed by "<" is a placeholder, like `…/docs/<page>`.
  const pattern = new RegExp(`${DOCS_URL.replaceAll(".", "\\.")}[^\\s)"'\`<>\\]|}]*<?`, "gu");
  const sources = [
    ...["README.md", "CONTRIBUTING.md", "release.md", "package.json"].map((file) => join(REPO_ROOT, file)),
    ...filesIn(join(REPO_ROOT, "src"), /\.ts$/u).map((file) => join(REPO_ROOT, "src", file)),
    ...filesIn(EXAMPLES_DIR, /\.(?:ts|mts|mjs|md|json)$/u, ["node_modules", "coverage"]).map((file) => join(EXAMPLES_DIR, file)),
    ...filesIn(join(REPO_ROOT, ".github"), /\.(?:ya?ml|md)$/u).map((file) => join(REPO_ROOT, ".github", file)),
  ];
  const urls = [...new Set(sources.flatMap((file) => [...read(file).matchAll(pattern)].map(([url]) => url.replace(/[.,:;]$/u, ""))))]
    .filter((url) => !url.endsWith("<"))
    .toSorted();

  it("are many", () => {
    expect(urls.length).toBeGreaterThan(30);
  });

  // The repository's links are checked against the docs of the repository's code – the current docs.
  it.each(urls)("%s resolves – its anchor too", async (url) => {
    const [path = "", ...anchors] = `${CURRENT}/${url.slice(DOCS_URL.length)}`.replace(/\/$/u, "").split("#");
    const { status, html } = await page(path);
    expect(status).toBe(200);
    expect(anchors.filter((anchor) => !new RegExp(`id="?${anchor}[" >]`, "u").test(html))).toEqual([]);
  });
});
