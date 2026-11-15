/**
 * Remark plugin: fills every code block whose meta names an example – ```` ```ts file=path#region ````
 * – with that snippet of the examples project, titles it with the file and links it to its source
 * on GitHub. The examples are type-checked, linted and tested, so every snippet on the site is too.
 *
 * The block must be empty: the examples are the only source of the code. Snippets in versioned
 * docs are frozen by `pnpm docs:version:cut`, so the plugin refuses to fill them from `main`.
 */
import { sep } from "node:path";
import type { Code, Paragraph, Root } from "mdast";
import { visit } from "unist-util-visit";
import { DEFAULT_BRANCH, sourceUrl } from "./site.mts";
import { parseRef, readSnippet, type Snippet } from "./snippets.mts";

/** `file=path#region` in a code block's meta. */
const FILE_META = /(?:^|\s)file=(\S+)/u;
const TITLE_META = /(?:^|\s)title=/u;

export interface ExampleSnippetsOptions {
  /** The examples project. */
  readonly examplesDir: string;
  /** Git ref the source links point to. Default: the default branch. */
  readonly ref?: string;
}

/** The snippet reference in a code block's meta, if any. */
export const snippetRefOf = (meta: string | null | undefined): string | undefined => FILE_META.exec(meta ?? "")?.[1];

/** The paragraph linking a snippet to its source, placed under the code block. */
export function sourceLink(snippet: Snippet, ref: string = DEFAULT_BRANCH): Paragraph {
  const path = `examples/${snippet.file}`;
  const [first, last] = snippet.lines;
  return {
    type: "paragraph",
    data: { hProperties: { className: ["example-source"] } },
    children: [
      { type: "text", value: "Source: " },
      {
        type: "link",
        url: sourceUrl(path, ref, snippet.lines),
        children: [{ type: "inlineCode", value: snippet.region ? `${path} (lines ${first}–${last})` : path }],
      },
    ],
  };
}

/** Fills `node` – which names the snippet `ref` – with its code, and titles it with the file. */
export function fillCodeBlock(node: Code, ref: string, examplesDir: string): Snippet {
  if (node.value.trim() !== "") {
    throw new Error(`the code block for "${ref}" must be empty – its code comes from examples/${ref.split("#")[0]}`);
  }
  const snippet = readSnippet(parseRef(ref), examplesDir);
  node.value = snippet.code;
  const meta = (node.meta ?? "").replace(FILE_META, "").trim();
  node.meta = TITLE_META.test(meta) ? meta : `title="examples/${snippet.file}" ${meta}`.trim();
  return snippet;
}

/** Whether `path` is a document of a versioned – frozen – copy of the docs. */
export const isVersioned = (path: string | undefined): boolean => path?.split(sep).includes("versioned_docs") ?? false;

export default function remarkExampleSnippets(options: ExampleSnippetsOptions) {
  const { examplesDir, ref = DEFAULT_BRANCH } = options;
  return (tree: Root, file: { path?: string }): void => {
    const where = file.path ?? "a document";
    visit(tree, "code", (node: Code, index, parent) => {
      const name = snippetRefOf(node.meta);
      if (name === undefined || parent === undefined || index === undefined) return undefined;
      if (isVersioned(file.path)) {
        throw new Error(`${where}: "${name}" – snippets in versioned docs must be frozen; run "pnpm docs:version:cut" (in docs/: "npm run version:cut")`);
      }
      let snippet: Snippet;
      try {
        snippet = fillCodeBlock(node, name, examplesDir);
      } catch (error) {
        throw new Error(`${where}: ${(error as Error).message}`, { cause: error });
      }
      parent.children.splice(index + 1, 0, sourceLink(snippet, ref));
      return index + 2; // skip the inserted link
    });
  };
}
