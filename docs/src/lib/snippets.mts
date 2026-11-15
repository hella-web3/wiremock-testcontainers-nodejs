/**
 * Code snippets from the examples project. A snippet reference – `path#region` or `path` – names a
 * file below `examples/` and, optionally, a region marked in it:
 *
 * ```ts
 * // #region quick-start
 * …the snippet…
 * // #endregion quick-start
 * ```
 *
 * Marker lines of any region are dropped from every snippet, so regions may nest and overlap.
 */
import { readFileSync } from "node:fs";
import { isAbsolute, join, normalize } from "node:path";

/** A region marker: `// #region name`, `# #region name` or `<!-- #region name -->`. */
const MARKER = /^\s*(?:\/\/|#|<!--)\s*#(region|endregion)(?:\s+([\w-]+))?/u;
const NAME = /^[a-z\d]+(?:-[a-z\d]+)*$/u;

/** `path#region`, parsed. */
export interface SnippetRef {
  /** A `/`-separated path below the examples project. */
  readonly file: string;
  /** The region's name; absent for the whole file. */
  readonly region?: string;
}

/** The code a {@link SnippetRef} names. */
export interface Snippet extends SnippetRef {
  /** Dedented, without marker lines or trailing blank lines. */
  readonly code: string;
  /** First and last line of the snippet in the file, 1-based – for links to the source. */
  readonly lines: readonly [number, number];
}

/** Parses `path#region`; throws for absolute paths, `..` and malformed region names. */
export function parseRef(ref: string): SnippetRef {
  const [file = "", region, ...rest] = ref.trim().split("#");
  if (file === "" || rest.length > 0) throw new Error(`invalid snippet reference "${ref}": expected "path" or "path#region"`);
  if (isAbsolute(file) || normalize(file).split(/[/\\]/u).includes("..") || file.includes("\\")) {
    throw new Error(`invalid snippet reference "${ref}": the path must be relative to the examples project, with "/" separators`);
  }
  if (region === undefined) return { file };
  if (!NAME.test(region)) throw new Error(`invalid snippet reference "${ref}": region names are kebab-case`);
  return { file, region };
}

/** `path#region` of a {@link SnippetRef}. */
export const formatRef = ({ file, region }: SnippetRef): string => (region ? `${file}#${region}` : file);

/** Every region of `source`: name → 0-based indexes of its `#region` and `#endregion` lines. */
export function regionsOf(source: string, file = "source"): Map<string, { readonly start: number; readonly end: number }> {
  const regions = new Map<string, { start: number; end: number }>();
  const open = new Map<string, number>();
  source.split("\n").forEach((line, index) => {
    const [, kind, name] = MARKER.exec(line) ?? [];
    if (!kind) return;
    const where = `${file}:${index + 1}`;
    if (!name || !NAME.test(name)) throw new Error(`${where}: "#${kind}" needs a kebab-case name`);
    if (kind === "region") {
      if (open.has(name) || regions.has(name)) throw new Error(`${where}: region "${name}" is defined twice`);
      open.set(name, index);
      return;
    }
    const start = open.get(name);
    if (start === undefined) throw new Error(`${where}: "#endregion ${name}" without "#region ${name}"`);
    open.delete(name);
    regions.set(name, { start, end: index });
  });
  const [unclosed] = open.keys();
  if (unclosed !== undefined) throw new Error(`${file}: region "${unclosed}" is never closed`);
  return regions;
}

/** Removes the common indentation of non-blank lines. */
export function dedent(lines: readonly string[]): string[] {
  const indents = lines.filter((line) => line.trim() !== "").map((line) => line.length - line.trimStart().length);
  const indent = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map((line) => line.slice(indent).trimEnd());
}

/** The snippet `ref` names in `source` – the file's content. */
export function extractSnippet(source: string, ref: SnippetRef): Snippet {
  const all = source.replace(/\r\n/gu, "\n").split("\n");
  const regions = regionsOf(source, ref.file);
  let [first, last] = [0, all.length - 1];
  if (ref.region !== undefined) {
    const region = regions.get(ref.region);
    if (!region) {
      const known = [...regions.keys()].join(", ") || "none";
      throw new Error(`${ref.file} has no region "${ref.region}" (regions: ${known})`);
    }
    [first, last] = [region.start + 1, region.end - 1];
  }
  const kept = all.map((line, index) => ({ line, index })).slice(first, last + 1).filter(({ line }) => !MARKER.test(line));
  while (kept.length > 0 && kept[kept.length - 1].line.trim() === "") kept.pop();
  while (kept.length > 0 && kept[0].line.trim() === "") kept.shift();
  if (kept.length === 0) throw new Error(`${formatRef(ref)} is empty`);
  const code = dedent(kept.map(({ line }) => line)).join("\n");
  return { ...ref, code, lines: [kept[0].index + 1, kept[kept.length - 1].index + 1] };
}

/** Reads the snippet `ref` names from the examples project at `root`. */
export function readSnippet(ref: SnippetRef | string, root: string): Snippet {
  const parsed = typeof ref === "string" ? parseRef(ref) : ref;
  let source: string;
  try {
    source = readFileSync(join(root, parsed.file), "utf8");
  } catch {
    throw new Error(`snippet "${formatRef(parsed)}": examples/${parsed.file} does not exist`);
  }
  return extractSnippet(source, parsed);
}
