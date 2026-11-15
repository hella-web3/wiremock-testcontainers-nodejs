import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FINGERPRINT, fingerprint, isUpToDate } from "../../src/lib/api-inputs.mts";
import { tempDir } from "../helpers.ts";

/** A library, a config file and an installed package – what TypeDoc reads. */
function project() {
  const root = tempDir({
    "src/index.ts": "export const a = 1;",
    "src/nested/b.ts": "export const b = 2;",
    "src/notes.md": "not an input",
    "typedoc.json": "{}",
    "node_modules/typedoc/package.json": '{ "version": "0.28.0" }',
  });
  const inputs = { sourceDir: join(root, "src"), files: [join(root, "typedoc.json")], packages: ["typedoc", "absent"], modulesDir: join(root, "node_modules") };
  return { root, inputs };
}

describe("fingerprint()", () => {
  it("is stable while nothing changes", () => {
    const { inputs } = project();
    expect(fingerprint(inputs)).toBe(fingerprint(inputs));
    expect(fingerprint(inputs)).toMatch(/^[0-9a-f]{64}$/u);
  });

  it.each<[string, (root: string) => void]>([
    ["a source file", (root) => writeFileSync(join(root, "src/nested/b.ts"), "export const b = 3;")],
    ["a new source file", (root) => writeFileSync(join(root, "src/c.ts"), "")],
    ["the configuration", (root) => writeFileSync(join(root, "typedoc.json"), '{ "name": "x" }')],
    ["a package's version", (root) => writeFileSync(join(root, "node_modules/typedoc/package.json"), '{ "version": "0.28.1" }')],
  ])("changes with %s", (_, change) => {
    const { root, inputs } = project();
    const before = fingerprint(inputs);
    change(root);
    expect(fingerprint(inputs)).not.toBe(before);
  });

  it("ignores files TypeDoc does not read", () => {
    const { root, inputs } = project();
    const before = fingerprint(inputs);
    writeFileSync(join(root, "src/notes.md"), "changed");
    expect(fingerprint(inputs)).toBe(before);
  });
});

describe("isUpToDate()", () => {
  it("requires the generated reference and a matching fingerprint", () => {
    const out = tempDir();
    expect(isUpToDate(out, "abc")).toBe(false); // nothing generated
    writeFileSync(join(out, "typedoc-sidebar.cjs"), "");
    expect(isUpToDate(out, "abc")).toBe(false); // no fingerprint
    writeFileSync(join(out, FINGERPRINT), "abc");
    expect(isUpToDate(out, "abc")).toBe(true);
    expect(isUpToDate(out, "def")).toBe(false); // inputs changed
  });
});
