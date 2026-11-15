/**
 * Remark plugin: turns absolute links to this site's docs – as JSDoc `@see` tags, READMEs and the
 * generated API reference write them – into site links. Docusaurus then checks them like any other
 * link (a broken page or anchor fails the build), and they point to the pages of the version they
 * are in: a versioned copy's, or – while the next major is in development – `/docs/next/…`.
 */
import { sep } from "node:path";
import type { Definition, Link, Root } from "mdast";
import { visit } from "unist-util-visit";

export interface LocalDocsLinksOptions {
  /** The docs' absolute URL, e.g. `https://acme.github.io/project/docs/`. */
  readonly docsUrl: string;
  /** The current docs' path below `/docs`: `""` (default) or `"next"`. */
  readonly currentPath?: string;
  /** The version served at `/docs` itself, if not the current docs. */
  readonly lastVersion?: string;
}

/** The path below `/docs` of the pages a document at `path` links to. */
export function versionPath(path: string | undefined, { currentPath = "", lastVersion }: Omit<LocalDocsLinksOptions, "docsUrl">): string {
  const version = versionOf(path);
  if (version === undefined) return currentPath;
  return version === lastVersion ? "" : version;
}

/** The version label of a document in `versioned_docs/version-<label>/`, if it is one. */
export function versionOf(path: string | undefined): string | undefined {
  const parts = path?.split(sep) ?? [];
  const at = parts.indexOf("versioned_docs");
  return at === -1 ? undefined : parts[at + 1]?.replace(/^version-/u, "");
}

/** The site path of `url` if it points into the docs – `/docs/…`, or `/docs/<version>/…` – else `url`. */
export function localDocsLink(url: string, docsUrl: string, version?: string): string {
  if (!url.startsWith(docsUrl)) return url;
  return `/docs/${version ? `${version}/` : ""}${url.slice(docsUrl.length)}`;
}

export default function remarkLocalDocsLinks(options: LocalDocsLinksOptions) {
  return (tree: Root, file: { path?: string }): void => {
    const version = versionPath(file.path, options) || undefined;
    visit(tree, ["link", "definition"], (node) => {
      const link = node as Link | Definition;
      link.url = localDocsLink(link.url, options.docsUrl, version);
    });
  };
}
