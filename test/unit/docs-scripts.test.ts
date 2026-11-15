import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error – a plain ES module script without type declarations
import { needsInstall, scriptOf } from "../../scripts/docs.mjs";

/**
 * The one way to run the docs: every docs task is a script in `docs/package.json`, and from the
 * repository root `pnpm docs:<script>` runs the script of the same name (`scripts/docs.mjs`).
 */
const scriptsOf = (file: string): Record<string, string> => JSON.parse(readFileSync(file, "utf8")).scripts;
const root = scriptsOf("package.json");
const docs = scriptsOf("docs/package.json");

const temporary: string[] = [];
afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("pnpm docs:<script> – the docs' scripts from the repository root", () => {
  it("has a root twin for every docs script, and nothing else", () => {
    const twins = Object.keys(root).filter((name) => name.startsWith("docs:")).map((name) => name.slice("docs:".length));
    expect(twins).toEqual(Object.keys(docs));
  });

  it.each(Object.keys(docs))("docs:%s forwards to the docs script of the same name", (name) => {
    expect(root[`docs:${name}`]).toBe("node scripts/docs.mjs");
  });

  it("takes the script from the pnpm script's name, or else from the first argument", () => {
    expect(scriptOf("docs:version:cut", ["0.x"])).toEqual({ script: "version:cut", args: ["0.x"] });
    expect(scriptOf(undefined, ["check", "--x"])).toEqual({ script: "check", args: ["--x"] });
    expect(scriptOf("test", [])).toEqual({ script: undefined, args: [] });
  });

  it("installs docs/ when its dependencies are missing or older than its lockfile", () => {
    const dir = mkdtempSync(join(tmpdir(), "docs-install-"));
    temporary.push(dir);
    writeFileSync(join(dir, "package-lock.json"), "{}");
    expect(needsInstall(dir)).toBe(true);
    mkdirSync(join(dir, "node_modules"));
    writeFileSync(join(dir, "node_modules", ".package-lock.json"), "{}");
    utimesSync(join(dir, "package-lock.json"), new Date(1_000), new Date(1_000));
    expect(needsInstall(dir)).toBe(false);
    utimesSync(join(dir, "package-lock.json"), new Date(), new Date(Date.now() + 60_000));
    expect(needsInstall(dir)).toBe(true);
  });

  it("names the available scripts for an unknown one – before installing anything", () => {
    const { status, stderr } = spawnSync(process.execPath, ["scripts/docs.mjs"], {
      env: { PATH: process.env.PATH ?? "", npm_lifecycle_event: "docs:nope" },
      encoding: "utf8",
    });
    expect(status).toBe(1);
    expect(stderr).toContain('docs/package.json has no script "nope". Available: pnpm docs:start, pnpm docs:build');
  });
});

/** Markdown, MDX, workflows and sources that may mention docs commands – not dependencies or builds. */
function documents(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (["node_modules", "dist", "build", "coverage", ".docusaurus", ".git", "api"].includes(entry)) return [];
    if (statSync(path).isDirectory()) return documents(path);
    return /\.(?:mdx?|ya?ml|ts|mts|mjs|json)$/u.test(entry) && !entry.endsWith("lock.json") ? [path] : [];
  });
}

describe("how the docs say to run the docs", () => {
  const files = [...documents("."), ...documents(".github")].map((file) => ({ file, text: readFileSync(file, "utf8") }));
  const mentions = files.flatMap(({ file, text }) =>
    [...text.matchAll(/pnpm docs:([\w:-]+)/gu)].map(([, name]) => ({ file, name: (name ?? "").replace(/:$/u, "") })),
  );

  it("mentions pnpm docs:<script> commands", () => {
    expect(mentions.length).toBeGreaterThan(20);
  });

  it.each(mentions)("$file: pnpm docs:$name is a docs script", ({ name }) => {
    expect(Object.keys(docs)).toContain(name);
  });

  it.each(["docs/README.md", "docs/docs/contributing/documentation.mdx"])("%s lists every docs script, from the root and from docs/", (file) => {
    const text = readFileSync(file, "utf8");
    for (const name of Object.keys(docs)) {
      expect(text).toContain(`\`pnpm docs:${name}\``);
      expect(text).toContain(`\`npm run ${name}\``);
    }
  });
});
