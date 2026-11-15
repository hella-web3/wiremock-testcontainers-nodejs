import { join } from "node:path";
import type { Code, Paragraph, Root } from "mdast";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, it } from "vitest";
import remarkExampleSnippets, { fillCodeBlock, isVersioned, snippetRefOf, sourceLink } from "../../src/lib/remark-example-snippets.mts";
import { tempDir } from "../helpers.ts";

const EXAMPLE = 'const a = 1;\n// #region greet\nexport const greet = (name: string) => `Hi ${name}`;\n// #endregion greet\n';

/** Runs the plugin over `markdown`, as a document at `path`. */
async function transform(markdown: string, examplesDir: string, path?: string): Promise<Root> {
  const processor = unified().use(remarkParse).use(remarkMdx).use(remarkExampleSnippets, { examplesDir });
  const tree = processor.parse(markdown);
  return (await processor.run(tree, { path, value: markdown })) as Root;
}

describe("snippetRefOf()", () => {
  it.each([
    ["file=a.ts", "a.ts"],
    ['title="x" file=a/b.ts#r showLineNumbers', "a/b.ts#r"],
    ["showLineNumbers", undefined],
    [null, undefined],
    [undefined, undefined],
  ])("reads %j", (meta, ref) => {
    expect(snippetRefOf(meta)).toBe(ref);
  });
});

describe("remarkExampleSnippets", () => {
  it("fills the block, titles it with the file and links it to its lines on GitHub", async () => {
    const examples = tempDir({ "greet/greet.ts": EXAMPLE });
    const tree = await transform("Intro\n\n```ts file=greet/greet.ts#greet\n```\n\nOutro", examples, join("/site", "docs", "a.mdx"));
    const [, code, link, outro] = tree.children as [Paragraph, Code, Paragraph, Paragraph];
    expect(code).toMatchObject({ lang: "ts", meta: 'title="examples/greet/greet.ts"', value: "export const greet = (name: string) => `Hi ${name}`;" });
    expect(link.data).toEqual({ hProperties: { className: ["example-source"] } });
    expect(link.children[1]).toMatchObject({
      type: "link",
      url: "https://github.com/hella-web3/wiremock-testcontainers-nodejs/blob/main/examples/greet/greet.ts#L3-L3",
      children: [{ type: "inlineCode", value: "examples/greet/greet.ts (lines 3–3)" }],
    });
    expect(outro.children[0]).toMatchObject({ value: "Outro" });
  });

  it("fills several blocks – nested in lists, too – and keeps other blocks and explicit titles", async () => {
    const examples = tempDir({ "a.ts": EXAMPLE });
    const markdown = '1. Step\n\n   ```ts title="Custom" showLineNumbers file=a.ts\n   ```\n\n```bash\nnpm test\n```\n\n```ts file=a.ts#greet\n```\n';
    const tree = await transform(markdown, examples);
    const list = tree.children[0] as { children: { children: Code[] }[] };
    const nested = list.children[0]?.children[1];
    expect(nested).toMatchObject({ meta: 'title="Custom" showLineNumbers', value: expect.stringContaining("const a = 1;") });
    expect(tree.children.map(({ type }) => type)).toEqual(["list", "code", "code", "paragraph"]);
    expect(tree.children[1]).toMatchObject({ lang: "bash", value: "npm test" });
  });

  it("links a whole file without line numbers in its label", () => {
    expect(sourceLink({ file: "a.ts", code: "x", lines: [1, 4] }, "v1.0.0").children[1]).toMatchObject({
      url: "https://github.com/hella-web3/wiremock-testcontainers-nodejs/blob/v1.0.0/examples/a.ts#L1-L4",
      children: [{ value: "examples/a.ts" }],
    });
  });

  it("fails the build for a missing file or region, naming the document", async () => {
    const examples = tempDir({ "a.ts": EXAMPLE });
    await expect(transform("```ts file=b.ts\n```", examples, "/site/docs/x.mdx")).rejects.toThrow('/site/docs/x.mdx: snippet "b.ts": examples/b.ts does not exist');
    await expect(transform("```ts file=a.ts#nope\n```", examples)).rejects.toThrow('a document: a.ts has no region "nope"');
  });

  it("requires the block to be empty: the example is the only source", async () => {
    await expect(transform("```ts file=a.ts\nconst copy = 1;\n```", tempDir({ "a.ts": EXAMPLE }))).rejects.toThrow(
      'the code block for "a.ts" must be empty – its code comes from examples/a.ts',
    );
  });

  it("refuses to fill snippets of versioned docs – they must be frozen", async () => {
    const path = join("/site", "versioned_docs", "version-1.x", "a.mdx");
    await expect(transform("```ts file=a.ts\n```", tempDir({ "a.ts": EXAMPLE }), path)).rejects.toThrow(
      'snippets in versioned docs must be frozen; run "pnpm docs:version:cut" (in docs/: "npm run version:cut")',
    );
  });
});

describe("helpers", () => {
  it("isVersioned() recognises versioned docs", () => {
    expect(isVersioned(join("/site", "versioned_docs", "version-1.x", "a.mdx"))).toBe(true);
    expect(isVersioned(join("/site", "docs", "a.mdx"))).toBe(false);
    expect(isVersioned(undefined)).toBe(false);
  });

  it("fillCodeBlock() fills a node without meta", () => {
    const node: Code = { type: "code", value: "", meta: undefined };
    expect(fillCodeBlock(node, "a.ts#greet", tempDir({ "a.ts": EXAMPLE })).lines).toEqual([3, 3]);
    expect(node.meta).toBe('title="examples/a.ts"');
  });
});
