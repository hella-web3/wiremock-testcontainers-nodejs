/**
 * Bundler loader, run before Docusaurus' MDX loader: declares the example files an MDX document
 * embeds as its dependencies. The remark plugin reads them behind the bundler's back, so without
 * this an edited example would not rebuild the pages showing it – neither in `pnpm docs:start` nor in a
 * cached build.
 */
import { join } from "node:path";
import { snippetRefOf } from "./remark-example-snippets.mts";
import { parseRef } from "./snippets.mts";

const FENCE = /^\s*(?:`{3,}|~{3,})(.*)$/u;

/** The example files `mdx` embeds, as absolute paths. */
export function snippetFiles(mdx: string, examplesDir: string): string[] {
  const refs = mdx.split("\n").flatMap((line) => snippetRefOf(FENCE.exec(line)?.[1]) ?? []);
  return [...new Set(refs.map((ref) => join(examplesDir, parseRef(ref).file)))];
}

/** What the loader needs of the bundler's loader context. */
export interface LoaderContext {
  getOptions(): { readonly examplesDir: string };
  addDependency(file: string): void;
}

/** The loader: adds the dependencies, passes the document on unchanged. */
export default function snippetDependenciesLoader(this: LoaderContext, source: string): string {
  for (const file of snippetFiles(source, this.getOptions().examplesDir)) this.addDependency(file);
  return source;
}
