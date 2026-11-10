import { defineConfig, type Rolldown } from "tsdown";

/**
 * Declaration maps (`declarationMap`, for go-to-definition into `src/`) make the dts plugin turn
 * on source maps for the JS output too. Those `.js.map` files are not published, so drop them and
 * the `sourceMappingURL` comment that would point consumers' tooling at a missing file.
 */
const dropJsSourceMaps: Rolldown.Plugin = {
  name: "drop-js-source-maps",
  generateBundle(_, bundle) {
    for (const [fileName, output] of Object.entries(bundle)) {
      if (/\.[cm]?js\.map$/u.test(fileName)) delete bundle[fileName];
      else if (output.type === "chunk" && !/\.d\.[cm]?ts$/u.test(fileName)) output.code = output.code.replace(/\n*\/\/# sourceMappingURL=\S+\s*$/u, "\n");
    }
  },
};

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
  // JSDoc ships once, in the declarations where editors read it; the JS stays unminified and
  // readable. Legal comments and `@__PURE__` annotations (used by consumers' tree-shaking) stay.
  outputOptions: { comments: { legal: true, annotation: true, jsdoc: false } },
  plugins: [dropJsSourceMaps],
  clean: true,
  // Package-correctness gates: publint (package.json/exports/files) and
  // "Are the types wrong?" (ESM/CJS typings resolve under every module mode).
  publint: true,
  attw: true,
});
