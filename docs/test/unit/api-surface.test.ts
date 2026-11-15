import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { apiUsage, jsDocExamples, publicApi } from "../../src/lib/api-surface.mts";
import { tempDir } from "../helpers.ts";

const LIBRARY = {
  "lib/index.ts": [
    'export { Builder } from "./builder";',
    "/**",
    " * Helps.",
    " * @see https://example.com/",
    " * @example",
    " */",
    "export function helper(): void {}",
    "/**",
    " * A name.",
    " * @example console.log(NAME);",
    " */",
    'export const NAME = "x";',
    "export interface Options { readonly a?: string }",
    "export type Source = string;",
  ].join("\n"),
  "lib/builder.ts": [
    "/**",
    " * Builds.",
    " * @example",
    " * new Builder().build();",
    " */",
    "export class Builder {",
    "  #secret = 1;",
    "  public label = 'b';",
    "  constructor() {}",
    "  private hidden(): number { return this.#secret; }",
    "  protected guarded(): number { return this.hidden(); }",
    "  build(): string { return 'x'; }",
    "  get value(): number { return this.guarded(); }",
    "  static create(): Builder { return new Builder(); }",
    "}",
  ].join("\n"),
  "usage/a.ts": [
    'import { Builder, helper, type Options } from "fixture-lib";',
    'import * as library from "fixture-lib";',
    'import { missing } from "not-installed";',
    "const options: Options = {};",
    "new Builder().build();",
    "helper();",
    "library.helper();",
    "missing();",
    "outer: for (;;) { break outer; }",
    "export const a = options.a; // a property – not an API item of its own",
    "export { options };",
  ].join("\n"),
  "usage/b.ts": ['import { NAME } from "fixture-lib/sub";', 'export { helper } from "fixture-lib";', "export const name = NAME;"].join("\n"),
};

describe("publicApi()", () => {
  it("lists exports and the public members of exported classes", () => {
    const root = tempDir(LIBRARY);
    const api = publicApi(join(root, "lib/index.ts"));
    expect(api.map(({ id, kind }) => `${kind} ${id}`).toSorted()).toEqual([
      "class Builder",
      "function helper",
      "interface Options",
      "member Builder.build",
      "member Builder.constructor",
      "member Builder.create",
      "member Builder.label",
      "member Builder.value",
      "type Source",
      "variable NAME",
    ]);
  });

  it("rejects exports it cannot classify, and files that are not modules", () => {
    const root = tempDir({ "enum.ts": "export enum E { A }", "script.ts": "const a = 1;" });
    expect(() => publicApi(join(root, "enum.ts"))).toThrow("unsupported export E");
    expect(() => publicApi(join(root, "script.ts"))).toThrow("script.ts is not a module");
    expect(() => publicApi(join(root, "missing.ts"))).toThrow("missing.ts is not a module");
  });
});

describe("apiUsage()", () => {
  it("resolves uses through imports, instances and package subpaths – not re-exports", () => {
    const root = tempDir(LIBRARY);
    const entry = join(root, "lib/index.ts");
    const [a, b] = [join(root, "usage/a.ts"), join(root, "usage/b.ts")];
    const usage = apiUsage([a, b], publicApi(entry), { "fixture-lib": entry, "fixture-lib/sub": entry });
    expect(Object.fromEntries(usage)).toEqual({
      Builder: [a],
      "Builder.constructor": [a],
      "Builder.build": [a],
      helper: [a],
      Options: [a],
      NAME: [b],
    });
  });

  it("finds nothing without an API", () => {
    const root = tempDir(LIBRARY);
    expect(apiUsage([join(root, "usage/a.ts")], [], {}).size).toBe(0);
  });

  it("fails for files it cannot read", () => {
    const root = tempDir(LIBRARY);
    expect(() => apiUsage([join(root, "nope.ts")], publicApi(join(root, "lib/index.ts")), {})).toThrow("nope.ts could not be read");
  });
});

describe("jsDocExamples()", () => {
  it("extracts each @example once, without the comment margins", () => {
    const root = tempDir(LIBRARY);
    const file = join(root, "lib/builder.ts");
    const index = join(root, "lib/index.ts");
    expect(jsDocExamples([index, file])).toEqual([
      { file: index, code: "" },
      { file: index, code: "console.log(NAME);" },
      { file, code: "new Builder().build();" },
    ]);
  });

  it("fails for files it cannot read", () => {
    expect(() => jsDocExamples([join(tempDir(), "nope.ts")])).toThrow("nope.ts could not be read");
  });
});
