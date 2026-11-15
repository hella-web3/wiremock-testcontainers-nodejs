import { join } from "node:path";
import type { Root } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { describe, expect, it } from "vitest";
import remarkLocalDocsLinks, { localDocsLink, versionOf, versionPath } from "../../src/lib/remark-local-docs-links.mts";

const DOCS = "https://acme.github.io/project/docs/";

async function linksAfter(markdown: string, path?: string, currentPath?: string): Promise<string[]> {
  const processor = unified().use(remarkParse).use(remarkLocalDocsLinks, { docsUrl: DOCS, currentPath });
  const tree = (await processor.run(processor.parse(markdown), { path, value: markdown })) as Root;
  const urls: string[] = [];
  visit(tree, ["link", "definition"], (node) => {
    urls.push((node as { url: string }).url);
  });
  return urls;
}

describe("remarkLocalDocsLinks", () => {
  const markdown = `[a](${DOCS}guides/x#y) [b](https://example.com/) [c]\n\n[c]: ${DOCS}intro`;

  it("turns absolute docs links – inline and reference definitions – into site links", async () => {
    expect(await linksAfter(markdown, join("/site", "docs", "a.md"))).toEqual(["/docs/guides/x#y", "https://example.com/", "/docs/intro"]);
  });

  it("points the links of a versioned copy at that version", async () => {
    expect(await linksAfter(markdown, join("/site", "versioned_docs", "version-1.x", "api", "a.md"))).toEqual([
      "/docs/1.x/guides/x#y",
      "https://example.com/",
      "/docs/1.x/intro",
    ]);
  });

  it("points the links of the current docs at /docs/next while the next major is in development", async () => {
    expect(await linksAfter(markdown, join("/site", "docs", "a.md"), "next")).toEqual(["/docs/next/guides/x#y", "https://example.com/", "/docs/next/intro"]);
    expect(await linksAfter(markdown, join("/site", "versioned_docs", "version-1.x", "a.md"), "next")).toContain("/docs/1.x/guides/x#y");
  });

  it("versionPath(): a versioned copy served at /docs – the default while the next major is a pre-release – links there", () => {
    const versioned = join("/site", "versioned_docs", "version-1.x", "a.md");
    expect(versionPath(versioned, { currentPath: "next", lastVersion: "1.x" })).toBe("");
    expect(versionPath(versioned, { currentPath: "", lastVersion: "current" })).toBe("1.x");
    expect(versionPath(join("/site", "docs", "a.md"), {})).toBe("");
  });

  it("versionOf() reads the version of a versioned document", () => {
    expect(versionOf(join("/site", "versioned_docs", "version-2.x", "a.md"))).toBe("2.x");
    expect(versionOf(join("/site", "versioned_docs"))).toBeUndefined();
    expect(versionOf(join("/site", "docs", "a.md"))).toBeUndefined();
    expect(versionOf(undefined)).toBeUndefined();
  });

  it("localDocsLink() leaves other links alone", () => {
    expect(localDocsLink("https://acme.github.io/project/blog/", DOCS)).toBe("https://acme.github.io/project/blog/");
  });
});
