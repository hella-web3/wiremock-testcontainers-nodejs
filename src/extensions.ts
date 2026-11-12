import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, posix } from "node:path";
import { jarEntries } from "./jar";
import { EXTENSIONS_DIR } from "./runtime";
import { fail, isRecord, resolvePath, show, text, within, type WiremockStaticFile } from "./sources";

/** An extension JAR, or a directory of them – any {@link WiremockStaticFile}; `name` renames a JAR. */
export type WiremockExtensionJar = WiremockStaticFile;

/**
 * Base interface all WireMock extensions must implement: what WireMock loads for it. Implement at
 * least one optional member.
 * @example
 * class Uppercase implements WireMockExtension {
 *   getName() { return "uppercase"; }
 *   getClassNames() { return ["com.acme.UppercaseTransformer"]; }
 *   getJars() { return ["./acme.jar"]; }
 * }
 */
export interface WireMockExtension {
  /** Its name, e.g. WireMock's `"uppercase"`. Re-registering a name: no-op if configured alike, else an error. */
  getName(): string;
  /** Fully qualified Java class names, passed to `--extensions`. */
  getClassNames?(): readonly string[];
  /** JARs – or directories of them – for WireMock's class path. */
  getJars?(): readonly WiremockExtensionJar[];
  /** WireMock CLI options, one per entry: `"--flag"` or `"--option=value"`. */
  getOptions?(): readonly string[];
}

/** Represents a class constructor for an extension */
export type ExtensionConstructor<T extends WireMockExtension = WireMockExtension> = new () => T;

/** Union type of all supported ways to register an extension: a Java class name, a {@link WireMockExtension} or its class. */
export type ExtensionInput = string | ExtensionConstructor | WireMockExtension;

/** Options for `WiremockContainer.withExtensionOptions()`. */
export interface WiremockExtensionOptions {
  /** Load extensions JARs declare in `META-INF/services`; `false`: `--disable-extensions-scanning`. Default `true`. */
  readonly scanning?: boolean;
  /** Fail `start()` for a class in no registered JAR and not WireMock's own; off for classes the image provides. Default `true`. */
  readonly verifyClassNames?: boolean;
}

/** A validated extension JAR: where it goes and the classes it contains. */
export interface ExtensionJar {
  readonly target: string;
  readonly origin: string;
  readonly classes: readonly string[];
}

/** What one {@link ExtensionInput} contributes. */
export interface ExtensionContribution {
  /** The {@link WireMockExtension.getName} of a TypeScript extension; absent for class names. */
  readonly name?: string;
  readonly classNames: readonly string[];
  readonly jars: readonly ExtensionJar[];
  readonly options: readonly string[];
}

const IDENTIFIER = String.raw`[\p{L}_$][\p{L}\p{N}_$]*`;
const CLASS_NAME = new RegExp(`^${IDENTIFIER}(?:\\.${IDENTIFIER})+$`, "u");
const OPTION = /^--[a-z\d][\w-]*(?:=.*)?$/iu;
/** WireMock's own packages – in every image, never in a registered JAR. */
const BUILT_IN = ["com.github.tomakehurst.wiremock.", "org.wiremock."];

/** Validates a fully qualified Java class name, with a hint for the usual mistakes. */
export function className(value: unknown): string {
  const name = text(value, "class name").trim();
  // "class" is a keyword, never part of a class name.
  if (CLASS_NAME.test(name) && !name.endsWith(".class")) return name;
  const hint = name.endsWith(".class")
    ? 'drop the ".class" suffix'
    : /[/\\]/u.test(name)
      ? 'separate packages with "." not "/"'
      : name.includes(".")
        ? "only letters, digits, _ and $ may form each part"
        : "include the package – an extension's short name is not enough";
  return fail(`"${name}" is not a fully qualified Java class name such as "com.acme.MyTransformer" (${hint})`);
}

/** Reads a JAR and lists its classes. */
function inspectJar(origin: string, name: string): ExtensionJar {
  if (name.includes("/")) fail(`name "${name}" must be a file name: WireMock's class path holds only the JARs directly in ${EXTENSIONS_DIR}`);
  if (!/\.jar$/iu.test(name)) fail(`"${name}" must end in ".jar" – WireMock's class path picks up only *.jar files; pass { file, name: "<name>.jar" } to rename it`);
  let bytes: Buffer;
  try {
    bytes = readFileSync(origin);
  } catch (error) {
    return fail(`"${origin}" cannot be read: ${(error as Error).message}`);
  }
  const entries = within(`"${origin}" is not a valid JAR`, () => jarEntries(bytes)).map((entry) => entry.name);
  const classes = entries.filter((entry) => entry.endsWith(".class") && !entry.startsWith("META-INF/")).map((entry) => entry.slice(0, -6).replaceAll("/", "."));
  if (classes.length === 0 && !entries.some((entry) => entry.startsWith("META-INF/services/"))) {
    fail(`"${origin}" contains no Java classes – is it really an extension JAR?`);
  }
  return { target: posix.join(EXTENSIONS_DIR, name), origin, classes };
}

/** Resolves a {@link WiremockExtensionJar} – a JAR, or a directory of them – to validated JARs. */
export function resolveJars(source: unknown): ExtensionJar[] {
  const path = resolvePath(source);
  const stats = statSync(path, { throwIfNoEntry: false }) ?? fail(`"${path}" does not exist`);
  const name = isRecord(source) ? source.name : undefined;
  if (stats.isDirectory()) {
    if (name !== undefined) fail(`"name" cannot rename the directory "${path}", only a single JAR`);
    const jars = readdirSync(path, { withFileTypes: true }).filter((entry) => entry.isFile() && /\.jar$/iu.test(entry.name));
    if (jars.length === 0) fail(`the directory "${path}" contains no *.jar files`);
    return jars.map((entry) => entry.name).toSorted().map((file) => inspectJar(join(path, file), file));
  }
  if (!stats.isFile()) fail(`"${path}" is not a file`);
  return [inspectJar(path, name === undefined ? basename(path) : text(name, "name"))];
}

/** Calls an optional list-returning member of a TypeScript extension. */
function list<T>(extension: WireMockExtension, member: "getClassNames" | "getJars" | "getOptions"): readonly T[] {
  const method: unknown = extension[member];
  if (method === undefined) return [];
  if (typeof method !== "function") fail(`${member} must be a method, got ${show(method)}`);
  const value: unknown = method.call(extension);
  return Array.isArray(value) ? value : fail(`${member}() must return an array, got ${show(value)}`);
}

/** What `input` contributes – class names, JARs and options, all validated. */
export function contribution(input: unknown): ExtensionContribution {
  if (typeof input === "string") return { classNames: [className(input)], jars: [], options: [] };
  let extension = input;
  if (typeof input === "function") {
    try {
      extension = new (input as ExtensionConstructor)();
    } catch (error) {
      return fail(`could not instantiate the extension class ${input.name || "(anonymous)"}: ${(error as Error).message}`);
    }
  }
  if (!isRecord(extension) || typeof extension.getName !== "function") {
    return fail(`unsupported extension ${show(input)}; expected a fully qualified Java class name, a WireMockExtension or its class`);
  }
  const ext = extension as unknown as WireMockExtension;
  const name = text(ext.getName(), "getName()");
  return within(`extension "${name}"`, () => {
    const options = list<unknown>(ext, "getOptions").map((option) =>
      typeof option === "string" && OPTION.test(option)
        ? option
        : fail(`option ${show(option)} must be "--flag" or "--option=value", one option per entry`),
    );
    if (options.some((option) => optionName(option) === "--extensions")) fail('set class names with getClassNames(), not "--extensions"');
    const classNames = list<unknown>(ext, "getClassNames").map(className);
    const jars = list<unknown>(ext, "getJars").flatMap(resolveJars);
    if (classNames.length + jars.length + options.length === 0) fail("it contributes nothing: implement getClassNames(), getJars() or getOptions()");
    return { name, classNames, jars, options };
  });
}

/** `--option` of `--option=value`. */
export const optionName = (option: string): string => option.split("=", 1)[0];

/**
 * `options` plus `added`, skipping exact duplicates.
 * @throws If an option is set twice with different values: WireMock refuses to start then.
 */
export function mergeOptions(options: readonly string[], added: readonly string[], from: string): string[] {
  const merged = [...options];
  for (const option of added) {
    if (merged.includes(option)) continue;
    const clash = merged.find((existing) => optionName(existing) === optionName(option));
    if (clash) fail(`option "${option}" conflicts with "${clash}" set by ${from}; WireMock accepts each option only once`);
    merged.push(option);
  }
  return merged;
}

/** The lower-case simple name of a class: `Inner` of `com.acme.Outer$Inner`. */
const simpleName = (name: string): string => name.slice(Math.max(name.lastIndexOf("."), name.lastIndexOf("$")) + 1).toLowerCase();

/**
 * Fails for a class that is in no registered JAR and not WireMock's own – WireMock would stop with
 * a `ClassNotFoundException` – suggesting classes of the same simple name.
 */
export function verifyClassNames(classNames: Iterable<string>, jars: readonly ExtensionJar[]): void {
  for (const name of classNames) {
    if (BUILT_IN.some((prefix) => name.startsWith(prefix)) || jars.some((jar) => jar.classes.includes(name))) continue;
    const similar = jars.flatMap((jar) => jar.classes.filter((candidate) => simpleName(candidate) === simpleName(name)));
    const where = jars.length ? `none of the registered extension JARs (${jars.map((jar) => basename(jar.target)).join(", ")})` : "no JAR: none is registered";
    fail(
      `class "${name}" is in ${where}${similar.length ? `; did you mean "${similar.join('" or "')}"?` : "."} ` +
        "Register its JAR with withExtensionJar(), or – if the image already provides it – skip this check with withExtensionOptions({ verifyClassNames: false })",
    );
  }
}
