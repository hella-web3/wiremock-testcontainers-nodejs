import { defineConfig } from "tsdown";

/**
 * Library build → `dist/`, the only directory published:
 *
 *   index.{js,cjs} + .d.{ts,cts}          the library
 *   no-docker.{js,cjs} + .d.{ts,cts}      the opt-in `./no-docker` harness (separate entry,
 *                                          never loaded by `index`)
 *   runtime-*.{js,cjs}                     the tiny registry both entries share
 *
 * JS is whitespace-minified (names kept); declarations are emitted natively by oxc
 * (`isolatedDeclarations`), without declaration or source maps.
 * `testcontainers` and `node:*` stay external – nothing is inlined.
 */
export default defineConfig({
  entry: ["src/index.ts", "src/no-docker.ts"],
  // CJS is kept on purpose: Jest / ts-node consumers still `require()` test helpers.
  format: ["esm", "cjs"],
  tsconfig: "tsconfig.build.json",
  dts: true,
  fixedExtension: false,
  sourcemap: false,
  // Whitespace only: -26 % tarball, yet every class, method and function keeps its name, so
  // stack traces stay meaningful. No mangling, no compression (full minify saves just 3 % more).
  minify: { compress: false, mangle: false, codegen: { removeWhitespace: true } },
  // JSDoc ships once, in the declarations where editors read it. Legal comments and
  // `@__PURE__` annotations (used by consumers' tree-shaking) stay.
  outputOptions: { comments: { legal: true, annotation: true, jsdoc: false } },
  clean: true,
  // Package-correctness gates: publint (package.json/exports/files) and
  // "Are the types wrong?" (ESM/CJS typings resolve under every module mode).
  publint: true,
  attw: true,
});
