import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import exampleSnippetsPlugin, { LOADER } from "../../src/lib/docusaurus-plugin-example-snippets.mts";
import snippetDependenciesLoader, { type LoaderContext, snippetFiles } from "../../src/lib/snippet-dependencies.mts";

const MDX = "# Page\n\n```ts file=a/b.ts#one\n```\n\n  ~~~ts title=\"x\" file=a/b.ts#two\n  ~~~\n\n```json file=c.json\n```\n\n```bash\nnpm i\n```";

describe("snippetFiles()", () => {
  it("lists the example files a document embeds, once each", () => {
    expect(snippetFiles(MDX, "/examples")).toEqual([join("/examples", "a/b.ts"), join("/examples", "c.json")]);
  });

  it("finds none in a document without snippets", () => {
    expect(snippetFiles("# Title\n\nText `file=x.ts`.", "/examples")).toEqual([]);
  });
});

describe("snippetDependenciesLoader", () => {
  it("declares the embedded example files as dependencies and passes the document on", () => {
    const addDependency = vi.fn<(file: string) => void>();
    const context: LoaderContext = { getOptions: () => ({ examplesDir: "/examples" }), addDependency };
    expect(snippetDependenciesLoader.call(context, MDX)).toBe(MDX);
    expect(addDependency.mock.calls).toEqual([[join("/examples", "a/b.ts")], [join("/examples", "c.json")]]);
  });
});

describe("exampleSnippetsPlugin", () => {
  const plugin = exampleSnippetsPlugin({ examplesDir: "/examples", contentDir: "/site/docs" });

  it("leaves watching to the bundler – a getPathsToWatch() glob would crawl examples/node_modules and, through the npm link, the whole repository", () => {
    expect(plugin.name).toBe("example-snippets");
    expect(plugin.getPathsToWatch).toBeUndefined();
  });

  it("runs the loader before the MDX loader, on the docs content", () => {
    const configure = plugin.configureWebpack as () => { module: { rules: { test: RegExp; include: string[]; enforce: string; use: unknown[] }[] } };
    const [rule] = configure().module.rules;
    expect(rule?.test.test("page.mdx")).toBe(true);
    expect(rule?.test.test("page.md")).toBe(true);
    expect(rule).toMatchObject({ include: ["/site/docs"], enforce: "pre", use: [{ loader: LOADER, options: { examplesDir: "/examples" } }] });
  });

  it("points at the loader module", () => {
    expect(existsSync(LOADER)).toBe(true);
  });
});
