import { defineConfig } from "tsdown";

/**
 * Library build → `dist/`, the only directory published: one barrel per format –
 * `index.{js,cjs}` + `index.d.{ts,cts}`. `./no-docker` is an alias of it, kept for existing imports.
 * Declarations are emitted by oxc (`isolatedDeclarations`), without maps; `testcontainers` and
 * `node:*` stay external.
 */
const NAMES = { function: true, class: true };

export default defineConfig({
  entry: ["src/index.ts"],
  // CJS is kept on purpose: Jest / ts-node consumers still `require()` test helpers.
  format: ["esm", "cjs"],
  tsconfig: "tsconfig.build.json",
  dts: true,
  fixedExtension: false,
  sourcemap: false,
  // Full minify, but every function and class keeps its name, so stack traces stay meaningful;
  // only locals and #private fields are shortened (-10 % tarball over whitespace-only).
  minify: { compress: { keepNames: NAMES }, mangle: { keepNames: NAMES }, codegen: { removeWhitespace: true } },
  // JSDoc ships once, in the declarations where editors read it. Legal comments and
  // `@__PURE__` annotations (used by consumers' tree-shaking) stay.
  outputOptions: { comments: { legal: true, annotation: true, jsdoc: false } },
  clean: true,
  // Package-correctness gates: publint (package.json/exports/files) and
  // "Are the types wrong?" (ESM/CJS typings resolve under every module mode).
  publint: true,
  attw: true,
});
