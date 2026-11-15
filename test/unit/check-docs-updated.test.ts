import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
// @ts-expect-error – a plain ES module script without type declarations
import { LABEL, verdict } from "../../scripts/check-docs-updated.mjs";

/**
 * `scripts/check-docs-updated.mjs`, the CI check of the definition of done: library changes come
 * with docs or examples.
 */
const run = (files: string[], args: string[] = []) =>
  spawnSync(process.execPath, ["scripts/check-docs-updated.mjs", ...args], { input: files.join("\n"), encoding: "utf8" });

describe("check-docs-updated", () => {
  it.each([
    ["no library source changed", ["README.md", "test/unit/jar.test.ts"], [], true],
    ["source with docs", ["src/index.ts", "docs/docs/intro.mdx"], [], true],
    ["source with examples", ["src/index.ts", "examples/stubs/stubs.ts"], [], true],
    ["source alone, labelled", ["src/index.ts"], [LABEL], true],
    ["source alone", ["src/index.ts", "test/unit/jar.test.ts"], ["bug"], false],
  ])("%s → ok: %s", (_, files, labels, ok) => {
    expect(verdict(files, labels).ok).toBe(ok);
  });

  it("fails the build for source changes without docs, naming the files and the way out", () => {
    const { status, stderr } = run(["src/index.ts", "src/jar.ts"]);
    expect(status).toBe(1);
    expect(stderr).toContain("Library source changed (src/index.ts, src/jar.ts) but neither docs/ nor examples/ did.");
    expect(stderr).toContain(`label the pull request "${LABEL}"`);
  });

  it("passes with the label, read from --labels", () => {
    const { status, stdout } = run(["src/index.ts"], ["--labels", `enhancement, ${LABEL}`]);
    expect(status).toBe(0);
    expect(stdout).toContain(`accepted by the "${LABEL}" label`);
  });

  it("passes when docs changed too, ignoring blank lines", () => {
    const { status, stdout } = run(["src/index.ts", "", "docs/docs/intro.mdx"], ["--labels"]);
    expect(status).toBe(0);
    expect(stdout).toContain("together with docs or examples");
  });
});
