import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { codeBlocks, docPages, exampleFiles, filesIn, linksOf, pageOf, parseMdx, read, seeLinks } from "../../src/lib/content.mts";
import { tempDir } from "../helpers.ts";

describe("files", () => {
  it("filesIn() lists matching files recursively, sorted, skipping directories", () => {
    const root = tempDir({ "b.ts": "", "a/c.ts": "", "a/d.md": "", "skip/e.ts": "" });
    expect(filesIn(root, /\.ts$/u, ["skip"])).toEqual(["a/c.ts", "b.ts"]);
  });

  it("exampleFiles() lists example modules, not dependencies, fixtures or coverage", () => {
    const root = tempDir({ "a/x.ts": "", "s/y.mjs": "", "z.mts": "", "node_modules/p/i.ts": "", "__mocks__/m.ts": "", "packages/q/i.ts": "", "coverage/c.ts": "", "a/data.json": "" });
    expect(exampleFiles(root)).toEqual(["a/x.ts", "s/y.mjs", "z.mts"]);
  });

  it("docPages() lists hand-written pages, not the generated API reference", () => {
    const root = tempDir({ "intro.mdx": "", "guides/a.md": "", "api/index.md": "", "_partials/p.mdx": "" });
    expect(docPages(root)).toEqual(["_partials/p.mdx", "guides/a.md", "intro.mdx"]);
  });

  it("read() reads UTF-8", () => {
    expect(read(join(tempDir({ "a.txt": "ä" }), "a.txt"))).toBe("ä");
  });
});

describe("MDX", () => {
  const PAGE = 'import X from "./x";\n\n# Title\n\n<X />\n\n```ts file=a.ts#r\n```\n\n[a](./a.mdx) and [b](https://b.example/#x)\n\n```bash\nnpm i\n```';

  it("parses MDX, JSX included", () => {
    expect(parseMdx(PAGE).children.map(({ type }) => type)).toEqual(["mdxjsEsm", "heading", "mdxJsxFlowElement", "code", "paragraph", "code"]);
  });

  it("codeBlocks() returns the code blocks", () => {
    expect(codeBlocks(PAGE).map(({ lang, meta, value }) => ({ lang, meta, value }))).toEqual([
      { lang: "ts", meta: "file=a.ts#r", value: "" },
      { lang: "bash", meta: null, value: "npm i" },
    ]);
  });

  it("linksOf() returns the link targets", () => {
    expect(linksOf(PAGE)).toEqual(["./a.mdx", "https://b.example/#x"]);
  });
});

describe("docs links", () => {
  const DOCS = "https://acme.github.io/p/docs/";

  it("seeLinks() reads @see links to the docs, plain or {@link}", () => {
    const source = `/**\n * @see ${DOCS}guides/a\n * @see {@link ${DOCS}guides/b#c | B}\n * @see https://other.example/\n */`;
    expect(seeLinks(source, DOCS)).toEqual(["guides/a", "guides/b#c"]);
  });

  it("pageOf() finds the page a docs path names", () => {
    const content = tempDir({ "guides/a.mdx": "", "b.md": "", "c/index.mdx": "" });
    expect(pageOf("guides/a#x", content)).toBe("guides/a.mdx");
    expect(pageOf("b", content)).toBe("b.md");
    expect(pageOf("c", content)).toBe("c/index.mdx");
    expect(pageOf("missing", content)).toBeUndefined();
  });
});
