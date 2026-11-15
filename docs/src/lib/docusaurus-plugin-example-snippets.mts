/**
 * Docusaurus plugin: rebuilds pages when the examples they embed change, by declaring each page's
 * example files as bundler dependencies. The bundler then watches exactly those files in
 * `pnpm docs:start` and rebuilds only the pages showing them.
 *
 * Deliberately no `getPathsToWatch()`: Docusaurus watches those paths with chokidar following
 * symlinks, without ignoring `node_modules` – for `examples/` that crawls its dependencies and,
 * through the `npm link` to the library, the whole repository, and it reloads every plugin on each
 * change. That made the first compile of `pnpm docs:start` take minutes.
 */
import { fileURLToPath } from "node:url";
import type { Plugin } from "@docusaurus/types";

export interface ExampleSnippetsPluginOptions {
  /** The examples project. */
  readonly examplesDir: string;
  /** The docs content the rule applies to. */
  readonly contentDir: string;
}

/** The loader declaring the dependencies – `snippet-dependencies.mts` next to this file. */
export const LOADER = fileURLToPath(new URL("./snippet-dependencies.mts", import.meta.url));

export default function exampleSnippetsPlugin(options: ExampleSnippetsPluginOptions): Plugin {
  const { examplesDir, contentDir } = options;
  return {
    name: "example-snippets",
    configureWebpack: () => ({
      module: {
        // `include` is required: Docusaurus' fallback MDX loader excludes the `include` of every MDX rule.
        rules: [{ test: /\.mdx?$/u, include: [contentDir], enforce: "pre", use: [{ loader: LOADER, options: { examplesDir } }] }],
      },
    }),
  };
}
