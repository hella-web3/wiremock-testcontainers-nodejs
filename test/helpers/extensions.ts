import { randomUUID } from "node:crypto";
import { chmodSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { WireMockExtension, WiremockExtensionJar } from "../../src";
import { writePackage } from "./fixtures";

/**
 * WireMock extensions for the tests: JARs packed by `pnpm build:extensions` from the compiled
 * classes in `test/__mocks__/extensions/<jar>/classes` (see its README), TypeScript extensions
 * wrapping them, and scratch JARs for the failure cases.
 */

export const EXTENSION_FIXTURE_DIR = "./test/__mocks__/extensions";
/** `UppercaseTransformer`, `StubCountAdminApi` and `BodyLengthMatcher` – loaded only via `--extensions`. */
export const EXAMPLE_JAR = join(EXTENSION_FIXTURE_DIR, "example-extensions.jar");
/** `PoweredByTransformer`, listed in `META-INF/services` – loaded by WireMock's extension scanning. */
export const POWERED_BY_JAR = join(EXTENSION_FIXTURE_DIR, "powered-by-extension.jar");

const PACKAGE = "com.hellaweb3.wiremock.extensions";
export const CLASSES = {
  /** Response transformer `uppercase`: upper-cases the body, appends `suffix`, sets `X-Transformed-By`. */
  uppercase: `${PACKAGE}.UppercaseTransformer`,
  /** Admin API extension: `GET /__admin/stub-count` → `{ count }`. */
  stubCount: `${PACKAGE}.StubCountAdminApi`,
  /** Request matcher `body-too-long`: body longer than `maxLength`. */
  bodyLength: `${PACKAGE}.BodyLengthMatcher`,
  /** Global transformer adding `X-Powered-By: wiremock-extensions`; found by scanning. */
  poweredBy: `${PACKAGE}.PoweredByTransformer`,
} as const;

export const extensionsPath = (name: string): string => `/var/wiremock/extensions/${name}`;

// ---------------------------------------------------------------------------
// TypeScript extensions
// ---------------------------------------------------------------------------

/** A TypeScript extension bundling a Java class with its JAR – registered as a class. */
export class UppercaseExtension implements WireMockExtension {
  getName(): string {
    return "uppercase";
  }

  getClassNames(): string[] {
    return [CLASSES.uppercase];
  }

  getJars(): WiremockExtensionJar[] {
    return [{ module: import.meta.url, file: "../__mocks__/extensions/example-extensions.jar" }];
  }
}

/** A configuration-only TypeScript extension: WireMock's built-in templating, for every response. */
export class GlobalResponseTemplating implements WireMockExtension {
  getName(): string {
    return "response-template";
  }

  getOptions(): string[] {
    return ["--global-response-templating"];
  }
}

// ---------------------------------------------------------------------------
// JAR files
// ---------------------------------------------------------------------------

/**
 * A ZIP archive of stored (uncompressed) entries – enough to craft JARs the tests need: no
 * classes, resources only, an archive comment, ZIP64 end records.
 */
export function zip(entries: Record<string, string | Buffer>, { comment = "", zip64 = false } = {}): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const [file, data] = [Buffer.from(name), Buffer.from(content)];
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04_03_4b_50, 0);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(file.length, 26);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02_01_4b_50, 0);
    header.writeUInt32LE(data.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(file.length, 28);
    header.writeUInt32LE(offset, 42);
    parts.push(local, file, data);
    central.push(header, file);
    offset += 30 + file.length + data.length;
  }
  const directory = Buffer.concat(central);
  const count = Object.keys(entries).length;
  const zip64End: Buffer[] = [];
  if (zip64) {
    const record = Buffer.alloc(56);
    record.writeUInt32LE(0x06_06_4b_50, 0);
    record.writeBigUInt64LE(44n, 4);
    record.writeBigUInt64LE(BigInt(count), 24);
    record.writeBigUInt64LE(BigInt(count), 32);
    record.writeBigUInt64LE(BigInt(directory.length), 40);
    record.writeBigUInt64LE(BigInt(offset), 48);
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07_06_4b_50, 0);
    locator.writeBigUInt64LE(BigInt(offset + directory.length), 8);
    locator.writeUInt32LE(1, 16);
    zip64End.push(record, locator);
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06_05_4b_50, 0);
  end.writeUInt16LE(zip64 ? 0xff_ff : count, 8);
  end.writeUInt16LE(zip64 ? 0xff_ff : count, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(zip64 ? 0xff_ff_ff_ff : offset, 16);
  end.writeUInt16LE(Buffer.byteLength(comment), 20);
  return Buffer.concat([...parts, directory, ...zip64End, end, Buffer.from(comment)]);
}

/** Unique per test file; written by {@link writeJarScratch}. */
export const JAR_SCRATCH_DIR = join(tmpdir(), `wiremock-jars-${randomUUID()}`);
const scratch = (path: string): string => join(JAR_SCRATCH_DIR, path);
export const JARS = {
  /** Text, named `.jar`. */
  notAZip: scratch("not-a-zip.jar"),
  /** A ZIP without entries. */
  empty: scratch("empty.jar"),
  /** A ZIP holding only a text file. */
  resourcesOnly: scratch("resources.jar"),
  /** Only `META-INF/services` – pointing at classes of another JAR. */
  servicesOnly: scratch("services-only.jar"),
  /** The example JAR with a `.zip` extension. */
  zipExtension: scratch("example-extensions.zip"),
  /** Another JAR named `example-extensions.jar`. */
  impostor: scratch("impostor/example-extensions.jar"),
  /** A directory with two JARs (and a README that is ignored). */
  directory: scratch("lib"),
  /** A directory without JARs. */
  emptyDirectory: scratch("no-jars"),
  /** A directory named like a JAR. */
  directoryNamedJar: scratch("classes.jar"),
  /** A classic `Outer$Inner` class. */
  nested: scratch("nested.jar"),
  /** The example JAR without read permission. */
  unreadable: scratch("unreadable.jar"),
  /** npm packages shipping JARs, below `JAR_SCRATCH_DIR/node_modules`. */
  packages: { single: "@acme/wiremock-extension", directory: "wiremock-extension-bundle" },
} as const;

/** Writes {@link JARS}; call in `beforeAll`, remove {@link JAR_SCRATCH_DIR} in `afterAll`. */
export function writeJarScratch(): void {
  for (const dir of [JARS.directory, JARS.emptyDirectory, JARS.directoryNamedJar, join(JARS.impostor, "..")]) mkdirSync(dir, { recursive: true });
  writeFileSync(JARS.notAZip, "definitely not a zip");
  writeFileSync(JARS.empty, zip({}));
  writeFileSync(JARS.resourcesOnly, zip({ "README.txt": "hello" }));
  writeFileSync(JARS.servicesOnly, zip({ "META-INF/services/com.github.tomakehurst.wiremock.extension.Extension": CLASSES.poweredBy }));
  writeFileSync(JARS.impostor, zip({ "com/acme/Other.class": "" }));
  writeFileSync(JARS.nested, zip({ "com/acme/Outer.class": "", "com/acme/Outer$Inner.class": "" }));
  writeFileSync(join(JARS.emptyDirectory, "README.md"), "no jars here");
  copyFileSync(EXAMPLE_JAR, JARS.zipExtension);
  copyFileSync(EXAMPLE_JAR, join(JARS.directory, "b-example.jar"));
  copyFileSync(POWERED_BY_JAR, join(JARS.directory, "a-powered-by.JAR"));
  writeFileSync(join(JARS.directory, "README.md"), "ignored");
  copyFileSync(EXAMPLE_JAR, JARS.unreadable);
  chmodSync(JARS.unreadable, 0o000);
  writePackage(JAR_SCRATCH_DIR, JARS.packages.single, { "lib/example-extensions.jar": readFileSync(EXAMPLE_JAR) });
  writePackage(JAR_SCRATCH_DIR, JARS.packages.directory, { "jars/powered-by-extension.jar": readFileSync(POWERED_BY_JAR), "jars/README.md": "ignored" });
}

/** The fixture JARs as absolute paths, unaffected by a mocked `process.cwd()`. */
export const ABSOLUTE_JARS = { example: resolve(EXAMPLE_JAR), poweredBy: resolve(POWERED_BY_JAR) };
