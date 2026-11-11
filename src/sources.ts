import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** A path (relative to the working directory) or a `file:` URL. */
export type WiremockPath = string | URL;

/** A path or `file:` URL, `{ file }`, a file of an installed package `{ package, file }`, or one next to a module `{ module, file }`. */
export type WiremockFileSource =
  | WiremockPath
  | { readonly file: WiremockPath }
  | { readonly package: string; readonly file: string }
  | { readonly module: WiremockPath; readonly file: string };

/** A WireMock stub; fields besides `request` and `response` are passed through. */
export interface WiremockStubMapping {
  readonly request: object;
  readonly response: object;
  readonly [field: string]: unknown;
}

/** A file source, or inline JSON: a string, a stub or `{ mappings: [...] }`. */
export type WiremockMappingSource =
  | WiremockFileSource
  | { readonly json: string | WiremockStubMapping | { readonly mappings: readonly WiremockStubMapping[] } };

/** A file source; object forms may set `name`, the path below `__files/`. */
export type WiremockStaticFile = WiremockPath | (Exclude<WiremockFileSource, WiremockPath> & { readonly name?: string });

const PACKAGE_NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/u;

export function fail(message: string): never {
  throw new Error(message);
}

/** Runs `fn`, prefixing the message of any error it throws with `context`. */
export function within<T>(context: string, fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    throw new Error(`${context}: ${(error as Error).message}`, { cause: error });
  }
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const show = (value: unknown): string => (value instanceof URL ? value.href : (JSON.stringify(value) ?? String(value)));

const text = (value: unknown, field: string): string =>
  typeof value === "string" && value.trim() !== "" ? value : fail(`"${field}" must be a non-empty string, got ${show(value)}`);

const toPath = (value: unknown, field: string): string => {
  if (!(value instanceof URL) && !text(value, field).startsWith("file:")) return resolve(value as string);
  try {
    return fileURLToPath(value as WiremockPath);
  } catch {
    return fail(`"${field}" must be a path or a file: URL, got ${show(value)}`);
  }
};

const existingFile = (path: string): string => {
  const stats = statSync(path, { throwIfNoEntry: false });
  return stats?.isFile() ? path : fail(`"${path}" ${stats ? "is not a file" : "does not exist"}`);
};

/** Finds an installed package the way `require()` would from the working directory. */
const packageRoot = (name: string): string => {
  if (!PACKAGE_NAME.test(name)) fail(`"${name}" is not a valid npm package name`);
  const searchPaths = createRequire(join(process.cwd(), "noop.js")).resolve.paths(name) ?? [];
  const root = searchPaths.map((dir) => join(dir, name)).find((dir) => existsSync(join(dir, "package.json")));
  return root ?? fail(`package "${name}" is not installed (searched from "${process.cwd()}")`);
};

/** Resolves a {@link WiremockFileSource} to the absolute path of an existing file. */
export function resolveFile(source: unknown): string {
  if (typeof source === "string" || source instanceof URL) return existingFile(toPath(source, "source"));
  if (!isRecord(source)) return fail(`unsupported source ${show(source)}; expected a path, a file: URL, { file }, { package, file } or { module, file }`);
  const { file, package: pkg, module } = source;
  if (pkg !== undefined && module !== undefined) fail('a source may set "package" or "module", not both');
  if (pkg !== undefined) {
    const root = packageRoot(text(pkg, "package"));
    const path = resolve(root, text(file, "file"));
    return relative(root, path).split(sep)[0] === ".." ? fail(`"${String(file)}" must point to a file inside package "${pkg}"`) : existingFile(path);
  }
  if (module === undefined) return existingFile(toPath(file, "file"));
  const anchor = toPath(module, "module");
  return existingFile(resolve(statSync(anchor, { throwIfNoEntry: false })?.isDirectory() ? anchor : dirname(anchor), text(file, "file")));
}

/** Validates a `/`-separated relative container name (no empty, `.` or `..` segments). */
export const containerName = (name: unknown): string => {
  const value = text(name, "name");
  const invalid = value.split("/").some((part) => ["", ".", ".."].includes(part) || /[\\\0]/u.test(part));
  return invalid ? fail(`name "${value}" must be a relative path using "/" separators, without empty, "." or ".." segments`) : value;
};

/** Inline mapping JSON: strings verbatim, anything else pretty-printed. */
export const inlineJson = (json: unknown): string =>
  typeof json === "string" ? json : (JSON.stringify(json, null, 2) ?? fail('"json" must be a JSON string or an object'));

const parseJson = (json: string): unknown => {
  try {
    return JSON.parse(json);
  } catch (error) {
    return fail(`invalid JSON (${(error as Error).message})`);
  }
};

/** Validates a mapping file – one stub or `{ mappings: [...] }` – and returns its stub ids. */
export function stubIds(json: string): string[] {
  const value = parseJson(json);
  const many = isRecord(value) && "mappings" in value;
  const stubs = many ? value.mappings : [value];
  if (!Array.isArray(stubs) || stubs.length === 0) fail('"mappings" must be a non-empty array of stub mappings');
  return stubs.flatMap((stub: unknown, index) => {
    if (!isRecord(stub) || !isRecord(stub.request) || !isRecord(stub.response)) {
      fail(`${many ? `mappings[${index}]` : "the mapping"} is not a WireMock stub mapping ("request" and "response" objects are required)`);
    }
    const id = stub.id ?? stub.uuid;
    return typeof id === "string" ? [id] : [];
  });
}

/** {@link stubIds} of a file in a mounted directory; malformed files are left for WireMock to report. */
export const stubIdsOf = (path: string): string[] => {
  try {
    return path.endsWith(".json") ? stubIds(readFileSync(path, "utf8")) : [];
  } catch {
    return [];
  }
};

/** Files below `dir`, as `/`-separated relative paths. */
export const listFiles = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => !entry.isDirectory())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"));
