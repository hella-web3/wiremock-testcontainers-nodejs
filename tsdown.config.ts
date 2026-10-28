import { defineConfig } from "tsdown";

/**
 * Library build → `dist/`. Consumers receive:
 *
 *   index.js / index.cjs      unminified ESM + CJS (bundlers minify; stack traces stay readable)
 *   index.d.ts / index.d.cts  declarations, emitted natively by oxc thanks to
 *                             `isolatedDeclarations` in tsconfig.build.json
 *   *.d.ts.map                so "go to definition" lands in the shipped `src/`
 *
 * `testcontainers` and `node:*` stay external – nothing is inlined.
 */
export default defineConfig({
  entry: ["src/index.ts"],
  // CJS is kept on purpose: Jest / ts-node consumers still `require()` test
  // helpers. tsdown prints an ESM-only recommendation for this; ignore it.
  format: ["esm", "cjs"],
  tsconfig: "tsconfig.build.json",
  dts: true,
  fixedExtension: false,
  sourcemap: false,
  clean: true,
  // Package-correctness gates: publint (package.json/exports/files) and
  // "Are the types wrong?" (ESM/CJS typings resolve under every module mode).
  publint: true,
  attw: true,
});
