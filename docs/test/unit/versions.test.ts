import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Snippet } from "../../src/lib/snippets.mts";
import {
  cutVersions,
  docsVersions,
  documentsIn,
  freezeDocument,
  freezeVersion,
  isNextMajor,
  pinSourceLinks,
  versionProblems,
} from "../../src/lib/versions.mts";
import { tempDir } from "../helpers.ts";

const REPO = "https://github.com/hella-labs/wiremock-testcontainers-nodejs";
const read = (ref: string): Snippet => {
  const [file = "", region] = ref.split("#");
  return { file, ...(region ? { region } : {}), code: "const a = 1;\n\nconst b = 2;", lines: [3, 5] };
};

describe("freezeDocument()", () => {
  it("inlines each snippet with a title and a source link pinned to the ref", () => {
    const text = "# Page\n\n```ts file=a/b.ts#r\n```\n\nText.";
    expect(freezeDocument(text, read, "v1.2.3")).toBe(
      [
        "# Page",
        "",
        '```ts title="examples/a/b.ts"',
        "const a = 1;",
        "",
        "const b = 2;",
        "```",
        "",
        `<p className="example-source">Source: <a href="${REPO}/blob/v1.2.3/examples/a/b.ts#L3-L5"><code>examples/a/b.ts</code></a></p>`,
        "",
        "Text.",
      ].join("\n"),
    );
  });

  it("keeps indentation, explicit titles, other meta and blocks without file=", () => {
    const text = '1. Step\n\n   ```ts title="Mine" showLineNumbers file=a.ts\n   ```\n\n```bash\nnpm test\n```';
    const frozen = freezeDocument(text, read, "v1.0.0");
    expect(frozen).toContain('   ```ts title="Mine" showLineNumbers\n   const a = 1;\n\n   const b = 2;\n   ```\n\n   <p className="example-source">');
    expect(frozen).toContain("```bash\nnpm test\n```");
  });

  it("handles blocks without a language", () => {
    expect(freezeDocument("```file=a.ts\n```", read, "v1")).toMatch(/^``` title="examples\/a.ts"\n/u);
  });

  it("rejects an unclosed block", () => {
    expect(() => freezeDocument("x\n```ts file=a.ts\n", read, "v1", "page.mdx")).toThrow('page.mdx:2: the code block for "a.ts" is never closed');
  });
});

describe("pinSourceLinks()", () => {
  it("points blob, tree and edit links of main at the ref – and nothing else", () => {
    const text = `${REPO}/blob/main/src/index.ts#L1 ${REPO}/tree/main/examples ${REPO}/edit/main/docs ${REPO}/blob/dev/x https://example.com/blob/main/y`;
    expect(pinSourceLinks(text, "v2.0.0")).toBe(
      `${REPO}/blob/v2.0.0/src/index.ts#L1 ${REPO}/tree/v2.0.0/examples ${REPO}/edit/v2.0.0/docs ${REPO}/blob/dev/x https://example.com/blob/main/y`,
    );
  });
});

describe("freezeVersion()", () => {
  it("freezes every document below a versioned copy and reports the changed ones", () => {
    const dir = tempDir({
      "intro.mdx": "```ts file=a.ts\n```",
      "api/classes/X.md": `Defined in: [src/x.ts:1](${REPO}/blob/main/src/x.ts#L1)`,
      "plain.md": "Nothing to freeze.",
      "sidebar.json": `${REPO}/blob/main/x`,
    });
    expect(freezeVersion(dir, read, "v1.0.0").map((path) => path.slice(dir.length + 1)).toSorted()).toEqual([join("api", "classes", "X.md"), "intro.mdx"]);
    expect(readFileSync(join(dir, "intro.mdx"), "utf8")).toContain("const a = 1;");
    expect(readFileSync(join(dir, "api", "classes", "X.md"), "utf8")).toContain("/blob/v1.0.0/src/x.ts#L1");
    expect(readFileSync(join(dir, "sidebar.json"), "utf8")).toContain("/blob/main/"); // not a document
    expect(documentsIn(dir)).toHaveLength(3);
  });
});

describe("cutVersions()", () => {
  it("reads versions.json, newest first – or none", () => {
    expect(cutVersions(tempDir({ "versions.json": '["1.x", "0.x"]' }))).toEqual(["1.x", "0.x"]);
    expect(cutVersions(tempDir())).toEqual([]);
  });
});

describe("versionProblems()", () => {
  it.each<[string, string[]]>([
    ["0.4.1", []],
    ["1.0.0-next.0", ["0.x"]],
    ["1.0.0", ["0.x"]],
    ["3.2.1", ["2.x", "1.x", "0.x"]],
    ["2.0.0", ["1.x"]],
  ])("accepts %s with %j", (version, versions) => {
    expect(versionProblems(version, versions)).toEqual([]);
  });

  it("requires the previous major once past 0.x", () => {
    expect(versionProblems("1.0.0", [])).toEqual([
      'the library is at 1.0.0 but the 0.x docs were not kept: run "pnpm docs:version:cut 0.x --ref <last 0.x tag>" (in docs/: "npm run version:cut -- 0.x --ref …")',
    ]);
  });

  it("rejects the current or a newer major – the next major must be opened with the cut – and malformed labels", () => {
    const open = 'open the next major in the same change – "npm version premajor --preid next --no-git-tag-version" (see release.md)';
    expect(versionProblems("1.2.0", ["1.x", "0.x", "2.x", "next"])).toEqual([
      `"1.x" is cut, but the library is still at 1.2.0: ${open}`,
      `"2.x" is cut, but the library is still at 1.2.0: ${open}`,
      '"next" is not a major version label such as "1.x"',
    ]);
  });
});

describe("isNextMajor()", () => {
  it.each([
    ["1.0.0-next.0", true],
    ["2.0.0-rc.1", true],
    ["1.0.0", false],
    ["1.1.0-beta.1", false],
    ["0.4.1", false],
  ])("%s → %s", (version, next) => {
    expect(isNextMajor(version)).toBe(next);
  });
});

describe("docsVersions()", () => {
  it("shows the current docs at /docs, labelled with the major", () => {
    expect(docsVersions("0.4.1", [])).toEqual({ lastVersion: "current", current: { label: "0.x", path: "", banner: "none" } });
    expect(docsVersions("1.0.0", ["0.x"])).toEqual({ lastVersion: "current", current: { label: "1.x", path: "", banner: "none" } });
  });

  it("keeps the latest released major at /docs while the next one is a pre-release", () => {
    expect(docsVersions("2.0.0-next.3", ["1.x", "0.x"])).toEqual({
      lastVersion: "1.x",
      current: { label: "2.x (next)", path: "next", banner: "unreleased" },
    });
  });

  it("has nothing to fall back to without a cut version", () => {
    expect(docsVersions("1.0.0-next.0", [])).toEqual({ lastVersion: "current", current: { label: "1.x", path: "", banner: "none" } });
  });
});
