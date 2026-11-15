/**
 * Where things are: the site's URLs, the repository, and the directories the docs read from. The
 * single source for the docs config, the remark plugins, the scripts and the tests.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ORGANIZATION = "hella-web3";
export const PROJECT = "wiremock-testcontainers-nodejs";
export const PACKAGE_NAME = "@hellaweb3/wiremock-testcontainers-nodejs";

/** GitHub Pages: `https://<organization>.github.io/<project>/`. */
export const SITE_URL = `https://${ORGANIZATION}.github.io`;
export const BASE_URL = `/${PROJECT}/`;
/** The absolute URL of the docs, as source code and READMEs link to them. */
export const DOCS_URL = `${SITE_URL}${BASE_URL}docs/`;

export const REPOSITORY_URL = `https://github.com/${ORGANIZATION}/${PROJECT}`;
export const NPM_URL = `https://www.npmjs.com/package/${PACKAGE_NAME}`;
/** The branch the current docs are built from. */
export const DEFAULT_BRANCH = "main";

/** The repository root, the docs project, the examples project and the docs content. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const DOCS_ROOT = join(REPO_ROOT, "docs");
export const EXAMPLES_DIR = join(REPO_ROOT, "examples");
export const CONTENT_DIR = join(DOCS_ROOT, "docs");
export const VERSIONED_DIR = join(DOCS_ROOT, "versioned_docs");

/** A file of the repository on GitHub, at `ref`, optionally highlighting lines. */
export function sourceUrl(path: string, ref: string = DEFAULT_BRANCH, lines?: readonly [number, number]): string {
  const anchor = lines ? `#L${lines[0]}-L${lines[1]}` : "";
  return `${REPOSITORY_URL}/blob/${ref}/${path}${anchor}`;
}

/** The library's version, from the repository's `package.json`. */
export function libraryVersion(root: string = REPO_ROOT): string {
  const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string };
  return version;
}

/** The docs version label of a library version: one per major, e.g. `"0.x"` for `0.4.1`. */
export const versionLabel = (version: string): string => `${version.split(".")[0]}.x`;
