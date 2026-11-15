/**
 * When the API reference must be regenerated: a fingerprint of everything TypeDoc reads – the
 * library's source, the TypeDoc configuration and plugins, and their installed versions – is kept
 * next to the generated pages. `pnpm docs:start`, `docs:build` and `docs:test:e2e` regenerate only
 * when it changed, saving TypeDoc's run on every start.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { filesIn } from "./content.mts";

/** The fingerprint file, inside the generated API reference. */
export const FINGERPRINT = ".inputs";

/** What TypeDoc reads. */
export interface ApiInputs {
  /** The library's source directory. */
  readonly sourceDir: string;
  /** Configuration and plugin files. */
  readonly files: readonly string[];
  /** Packages whose version shapes the output, resolved from `modulesDir`. */
  readonly packages: readonly string[];
  readonly modulesDir: string;
}

/** A fingerprint of the inputs: their contents and the packages' versions. */
export function fingerprint({ sourceDir, files, packages, modulesDir }: ApiInputs): string {
  const hash = createHash("sha256");
  const sources = filesIn(sourceDir, /\.ts$/u).map((file) => join(sourceDir, file));
  for (const file of [...sources, ...files]) hash.update(`${file}\0`).update(readFileSync(file)).update("\0");
  for (const name of packages) {
    const manifest = join(modulesDir, name, "package.json");
    hash.update(`${name}@${existsSync(manifest) ? (JSON.parse(readFileSync(manifest, "utf8")) as { version: string }).version : "missing"}\0`);
  }
  return hash.digest("hex");
}

/** Whether the API reference in `outDir` was generated from inputs with this fingerprint. */
export const isUpToDate = (outDir: string, current: string, marker = "typedoc-sidebar.cjs"): boolean =>
  existsSync(join(outDir, marker)) && existsSync(join(outDir, FINGERPRINT)) && readFileSync(join(outDir, FINGERPRINT), "utf8") === current;
