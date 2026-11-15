/**
 * Every export and public member of the library is used in an example, explained in a guide and
 * listed in the API overview – and the library's own JSDoc examples and links are real.
 */
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { type ApiItem, apiUsage, jsDocExamples, publicApi } from "../../src/lib/api-surface.mts";
import { docPages, exampleFiles, filesIn, pageOf, read, seeLinks } from "../../src/lib/content.mts";
import { CONTENT_DIR, DOCS_URL, EXAMPLES_DIR, PACKAGE_NAME, REPO_ROOT } from "../../src/lib/site.mts";

const SOURCE_DIR = join(REPO_ROOT, "src");
const ENTRY = join(SOURCE_DIR, "index.ts");
const OVERVIEW = "reference/api-overview.mdx";

/** API items no example uses, and why. */
const NOT_IN_EXAMPLES: Readonly<Record<string, string>> = {
  "StartedWiremockContainer.constructor": "created by WiremockContainer.start() – users never call it",
};

/** Exports whose JSDoc has no `@see` link to the docs, and why – every other export has one. */
const UNLINKED: Readonly<Record<string, string>> = {
  ExtensionConstructor: "a part of ExtensionInput, which links to the docs",
  WaitUntilReadyOptions: "the options of waitUntilReady(), which links to the docs",
  detectCI: "documented next to isNoDockerRequested() and NO_DOCKER_ENV, which link to the docs",
};

const api = publicApi(ENTRY);
const exampleSources = exampleFiles(EXAMPLES_DIR).map((file) => join(EXAMPLES_DIR, file));
const usage = apiUsage(exampleSources, api, { [PACKAGE_NAME]: ENTRY, [`${PACKAGE_NAME}/no-docker`]: ENTRY });
const guides = docPages(CONTENT_DIR)
  .filter((page) => page !== OVERVIEW)
  .map((page) => read(join(CONTENT_DIR, page)))
  .join("\n");
const overview = read(join(CONTENT_DIR, OVERVIEW));

/** The JSDoc of a declaration – a variable's sits on its statement. */
const jsDocOf = ({ declaration }: ApiItem): string =>
  (ts.isVariableDeclaration(declaration) ? declaration.parent.parent : declaration).getFullText();

/** How guides write an item in inline code: `withMappings(…)`, `rpcUrl`, `new WiremockContainer(…)`. */
function mention({ id }: ApiItem): RegExp {
  const [owner = "", member] = id.split(".");
  const name = member === "constructor" ? `new ${owner}` : (member ?? owner);
  return new RegExp(`\`${name}[(\`]`, "u");
}

/** The API reference link the overview must have for an item. */
function referenceLink({ id, kind }: ApiItem): string {
  const [owner = "", member] = id.split(".");
  if (member !== undefined) return `(../api/classes/${owner}.md#${member.toLowerCase()})`;
  const directory = { class: "classes", function: "functions", variable: "variables", interface: "interfaces", type: "type-aliases" }[kind as Exclude<ApiItem["kind"], "member">];
  return `(../api/${directory}/${id}.md)`;
}

describe("the library's public API", () => {
  it("is found – every export and public class member", () => {
    expect(api.map(({ id }) => id)).toEqual(expect.arrayContaining(["WiremockContainer.withMappings", "StartedWiremockContainer.countRequests", "installNoDockerRuntime"]));
    expect(api.length).toBeGreaterThan(30);
  });

  it.each(api.filter(({ id }) => !(id in NOT_IN_EXAMPLES)))("$id is used in an example", ({ id }) => {
    expect(usage.get(id) ?? [], `use ${id} in an example of examples/`).not.toEqual([]);
  });

  it.each(Object.keys(NOT_IN_EXAMPLES))("%s is exempt, and still unused", (id) => {
    expect(usage.get(id)).toBeUndefined();
  });

  it.each(api.filter(({ id }) => !(id in NOT_IN_EXAMPLES)))("$id is explained in a guide", (item) => {
    expect(guides).toMatch(mention(item));
  });

  it.each(api)("$id is listed in the API overview, linked to its reference", (item) => {
    expect(overview).toContain(referenceLink(item));
  });
});

describe("the library's JSDoc", () => {
  const sources = filesIn(SOURCE_DIR, /\.ts$/u).map((file) => join(SOURCE_DIR, file));
  const corpus = exampleSources.map((file) => read(file).split("\n").map((line) => line.trim()));
  /** Whether `code`'s lines, trimmed, appear in a row in an example. */
  const isExcerpt = (code: string): boolean => {
    const lines = code.split("\n").map((line) => line.trim());
    return corpus.some((file) => file.some((_, start) => lines.every((line, offset) => file[start + offset] === line)));
  };

  it.each(jsDocExamples(sources).map(({ file, code }) => ({ file: file.slice(REPO_ROOT.length + 1), code })))(
    "$file: @example is an excerpt of a tested example – $code",
    ({ code }) => {
      expect(code).not.toBe("");
      expect(isExcerpt(code), "copy @example code from examples/ so that it is tested").toBe(true);
    },
  );

  it.each(sources.flatMap((file) => seeLinks(read(file), DOCS_URL).map((page) => ({ file: file.slice(REPO_ROOT.length + 1), page }))))(
    "$file: @see $page is a docs page",
    ({ page }) => {
      expect(pageOf(page, CONTENT_DIR)).toBeDefined();
    },
  );

  it.each(api.filter(({ kind, id }) => kind !== "member" && !(id in UNLINKED)))("$id links to the docs with @see", (item) => {
    expect(seeLinks(jsDocOf(item), DOCS_URL)).not.toEqual([]);
  });

  it.each(Object.keys(UNLINKED))("%s is exempt from @see, and an export", (id) => {
    expect(api.map((item) => item.id)).toContain(id);
  });
});
