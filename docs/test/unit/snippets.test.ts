import { describe, expect, it } from "vitest";
import { dedent, extractSnippet, formatRef, parseRef, readSnippet, regionsOf } from "../../src/lib/snippets.mts";
import { tempDir } from "../helpers.ts";

const SOURCE = `import { x } from "y";

// #region outer
describe("suite", () => {
  // #region inner
  it("works", () => {
    expect(x).toBe(1);
  });
  // #endregion inner

});
// #endregion outer
`;

describe("parseRef() and formatRef()", () => {
  it.each([
    ["a/b.ts", { file: "a/b.ts" }],
    ["a/b.ts#my-region", { file: "a/b.ts", region: "my-region" }],
    [" c.json ", { file: "c.json" }],
  ])("parses %j", (ref, parsed) => {
    expect(parseRef(ref)).toEqual(parsed);
    expect(formatRef(parsed)).toBe(ref.trim());
  });

  it.each([
    ["", 'expected "path" or "path#region"'],
    ["#region", 'expected "path" or "path#region"'],
    ["a.ts#b#c", 'expected "path" or "path#region"'],
    ["/etc/passwd", "relative to the examples project"],
    ["../src/index.ts", "relative to the examples project"],
    ["a\\b.ts", 'with "/" separators'],
    ["a.ts#Not_Kebab", "region names are kebab-case"],
  ])("rejects %j", (ref, message) => {
    expect(() => parseRef(ref)).toThrow(message);
  });
});

describe("regionsOf()", () => {
  it("finds nested regions with their marker lines", () => {
    expect(Object.fromEntries(regionsOf(SOURCE))).toEqual({ inner: { start: 4, end: 8 }, outer: { start: 2, end: 11 } });
  });

  it("accepts #, // and <!-- markers", () => {
    expect([...regionsOf("# #region a\n# #endregion a\n<!-- #region b -->\n<!-- #endregion b -->").keys()]).toEqual(["a", "b"]);
  });

  it.each([
    ["// #region\n// #endregion", 'x.ts:1: "#region" needs a kebab-case name'],
    ["// #region a\n// #endregion a\n// #region a\n// #endregion a", 'x.ts:3: region "a" is defined twice'],
    ["// #region a\n// #region a", 'x.ts:2: region "a" is defined twice'],
    ["// #endregion a", 'x.ts:1: "#endregion a" without "#region a"'],
    ["// #region a", 'x.ts: region "a" is never closed'],
  ])("rejects %j", (source, message) => {
    expect(() => regionsOf(source, "x.ts")).toThrow(message);
  });
});

describe("dedent()", () => {
  it("removes the common indentation, ignoring blank lines, and trailing spaces", () => {
    expect(dedent(["    a", "", "      b  ", "    c"])).toEqual(["a", "", "  b", "c"]);
  });

  it("leaves blank-only input alone", () => {
    expect(dedent(["", "  "])).toEqual(["", ""]);
  });
});

describe("extractSnippet()", () => {
  it("extracts a region, dedented, without nested markers – keeping inner blank lines", () => {
    expect(extractSnippet(SOURCE, { file: "x.ts", region: "outer" })).toEqual({
      file: "x.ts",
      region: "outer",
      code: 'describe("suite", () => {\n  it("works", () => {\n    expect(x).toBe(1);\n  });\n\n});',
      lines: [4, 11],
    });
  });

  it("extracts an inner region with its own line numbers", () => {
    expect(extractSnippet(SOURCE, { file: "x.ts", region: "inner" })).toMatchObject({
      code: 'it("works", () => {\n  expect(x).toBe(1);\n});',
      lines: [6, 8],
    });
  });

  it("extracts a whole file without any markers, normalising CRLF", () => {
    const { code, lines } = extractSnippet(SOURCE.replaceAll("\n", "\r\n"), { file: "x.ts" });
    expect(code).not.toContain("#region");
    expect(code.startsWith('import { x } from "y";\n\ndescribe')).toBe(true);
    expect(lines).toEqual([1, 11]); // the trailing blank line is dropped
  });

  it("names the known regions when one is missing", () => {
    expect(() => extractSnippet(SOURCE, { file: "x.ts", region: "nope" })).toThrow('x.ts has no region "nope" (regions: inner, outer)');
    expect(() => extractSnippet("const a = 1;", { file: "y.ts", region: "nope" })).toThrow("(regions: none)");
  });

  it("drops leading blank lines", () => {
    expect(extractSnippet("// #region a\n\n  x\n// #endregion a", { file: "x.ts", region: "a" })).toMatchObject({ code: "x", lines: [3, 3] });
  });

  it("rejects empty snippets", () => {
    expect(() => extractSnippet("// #region a\n\n// #endregion a\n", { file: "x.ts", region: "a" })).toThrow("x.ts#a is empty");
  });
});

describe("readSnippet()", () => {
  it("reads a snippet below the examples root, by reference or string", () => {
    const root = tempDir({ "a/b.ts": SOURCE });
    expect(readSnippet("a/b.ts#inner", root).lines).toEqual([6, 8]);
    expect(readSnippet({ file: "a/b.ts" }, root).code).toContain("describe");
  });

  it("names a missing file", () => {
    expect(() => readSnippet("missing.ts#a", tempDir())).toThrow('snippet "missing.ts#a": examples/missing.ts does not exist');
  });
});
