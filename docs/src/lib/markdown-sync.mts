/**
 * Snippets in Markdown rendered on GitHub and npm – READMEs – which no build can fill. A marker
 * comment names the snippet; the fenced code block right after it holds a copy, which
 * `pnpm docs:sync:markdown` rewrites and the tests compare:
 *
 * ````md
 * <!-- snippet: getting-started/quick-start.e2e.test.ts#quick-start -->
 * ```typescript
 * …
 * ```
 * ````
 */

/** The Markdown files, relative to the repository root, whose snippets are synced. */
export const SYNCED_MARKDOWN: readonly string[] = ["README.md"];

const MARKER = /^<!-- snippet: (\S+) -->\s*$/u;
const FENCE = /^(`{3,}|~{3,})/u;

/** A synced Markdown document: its new text and the snippets it references. */
export interface SyncResult {
  readonly text: string;
  readonly refs: readonly string[];
}

/** Rewrites the code block after each snippet marker of `text` with `read(ref)`. */
export function syncMarkdown(text: string, read: (ref: string) => string, file = "document"): SyncResult {
  const lines = text.split("\n");
  const output: string[] = [];
  const refs: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    output.push(line);
    const ref = MARKER.exec(line)?.[1];
    if (ref === undefined) continue;
    const opener = lines[index + 1] ?? "";
    const fence = FENCE.exec(opener)?.[1];
    if (fence === undefined) throw new Error(`${file}:${index + 1}: the snippet marker for "${ref}" must be followed by a code fence`);
    const closing = lines.findIndex((candidate, at) => at > index + 1 && candidate.startsWith(fence) && candidate.trim() === fence);
    if (closing === -1) throw new Error(`${file}:${index + 2}: the code fence after the snippet marker for "${ref}" is never closed`);
    refs.push(ref);
    output.push(opener, ...read(ref).split("\n"), lines[closing]);
    index = closing;
  }
  return { text: output.join("\n"), refs };
}
