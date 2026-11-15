/**
 * TypeDoc plugin: gives every generated API page a `description` front matter – the first
 * paragraph of its JSDoc summary – so search engines and link previews show what the page
 * documents instead of its first line ("Defined in: src/index.ts:427").
 */
import { type MarkdownApplication, MarkdownPageEvent } from "typedoc-plugin-markdown";

/** The documented parts of a reflection this plugin reads. */
interface Documented {
  readonly comment?: { readonly summary: readonly { readonly text: string }[] };
  readonly signatures?: readonly Documented[];
  readonly getSignature?: Documented;
}

const MAX_LENGTH = 200;

/** The first paragraph of the model's summary – or its first signature's – as one line. */
export function descriptionOf(model: unknown): string | undefined {
  const documented = (model ?? {}) as Documented;
  const comment = documented.comment ?? documented.signatures?.[0]?.comment ?? documented.getSignature?.comment;
  const [paragraph = ""] = (comment?.summary.map(({ text }) => text).join("") ?? "").trim().split(/\n\s*\n/u);
  const line = paragraph.replaceAll(/\s+/gu, " ").trim();
  if (line === "") return undefined;
  return line.length > MAX_LENGTH ? `${line.slice(0, MAX_LENGTH - 1).trimEnd()}…` : line;
}

/** `contents` with a front matter block holding `description`. */
export function withDescription(contents: string, description: string): string {
  // A JSON string is a valid double-quoted YAML scalar.
  return `---\ndescription: ${JSON.stringify(description)}\n---\n\n${contents}`;
}

export function load(app: MarkdownApplication): void {
  app.renderer.on(MarkdownPageEvent.END, (page: MarkdownPageEvent) => {
    const description = descriptionOf(page.model);
    if (description !== undefined && page.contents !== undefined) page.contents = withDescription(page.contents, description);
  });
}
