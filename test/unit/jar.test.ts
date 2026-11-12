import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { jarEntries, jarEntry, mainClass } from "../../src/jar";
import { CLASSES, EXAMPLE_JAR, POWERED_BY_JAR, zip } from "../helpers/extensions";

/**
 * The dependency-free JAR reader: extension JARs are validated and listed at registration, and
 * `--no-docker` reads WireMock's `Main-Class`. Real JARs (built by `jar`, deflated) and crafted
 * ones (stored, commented, ZIP64, corrupt) are read for real.
 */
const WIREMOCK_BUILD = "node_modules/wiremock/build";
const WIREMOCK_JAR = join(WIREMOCK_BUILD, readdirSync(WIREMOCK_BUILD).find((file) => file.endsWith(".jar")) ?? "");
const classFile = (name: string): string => `${name.replaceAll(".", "/")}.class`;
const names = (bytes: Buffer): string[] => jarEntries(bytes).map(({ name }) => name);

/** A one-entry archive whose central-directory compression method is `method`. */
const withMethod = (content: string | Buffer, method: number): Buffer => {
  const bytes = zip({ "a.txt": content });
  bytes.writeUInt16LE(method, bytes.indexOf("PK\u0001\u0002", 0, "latin1") + 10);
  return bytes;
};
const corruptLocalHeader = (): Buffer => {
  const bytes = zip({ "a.txt": "x" });
  bytes.writeUInt32LE(0, 0);
  return bytes;
};

describe("jarEntries()", () => {
  it("lists the entries of the fixture JARs built by `jar`", () => {
    expect(names(readFileSync(EXAMPLE_JAR))).toEqual(
      expect.arrayContaining(["META-INF/MANIFEST.MF", classFile(CLASSES.uppercase), classFile(CLASSES.stubCount), classFile(CLASSES.bodyLength)]),
    );
    expect(names(readFileSync(POWERED_BY_JAR))).toContain("META-INF/services/com.github.tomakehurst.wiremock.extension.Extension");
  });

  it("lists the 10 000+ entries of WireMock's standalone JAR", () => {
    expect(names(readFileSync(WIREMOCK_JAR)).length).toBeGreaterThan(10_000);
  });

  it.each([
    ["stored entries", zip({ "a/B.class": "x", "c.txt": "y" })],
    ["an archive comment", zip({ "a/B.class": "x", "c.txt": "y" }, { comment: "built by hand" })],
    ["ZIP64 end records", zip({ "a/B.class": "x", "c.txt": "y" }, { zip64: true })],
  ])("reads archives with %s", (_, bytes) => {
    expect(names(bytes)).toEqual(["a/B.class", "c.txt"]);
  });

  it("reads an empty archive", () => {
    expect(jarEntries(zip({}))).toEqual([]);
  });

  it.each([
    ["an empty buffer", Buffer.alloc(0)],
    ["text", Buffer.from("definitely not a zip, but long enough to be one")],
    ["an end record followed by more than 64 KiB", Buffer.concat([zip({}), Buffer.alloc(0x1_00_00)])],
  ])("rejects %s as not a ZIP archive", (_, bytes) => {
    expect(() => jarEntries(bytes)).toThrow("not a ZIP archive");
  });

  it("rejects a truncated central directory", () => {
    const bytes = zip({ "a/B.class": "x" });
    bytes.writeUInt16LE(2, bytes.length - 12); // claims two entries, holds one
    expect(() => jarEntries(bytes)).toThrow("corrupt ZIP central directory");
  });
});

describe("jarEntry() and mainClass()", () => {
  it("inflates a deflated entry – WireMock's manifest names its entry point", () => {
    expect(jarEntry(readFileSync(WIREMOCK_JAR), "META-INF/MANIFEST.MF")?.toString()).toContain("Implementation-Title: WireMock");
    expect(mainClass(readFileSync(WIREMOCK_JAR))).toBe("wiremock.Run");
  });

  it("reads a stored entry and a Main-Class with CRLF line endings", () => {
    const bytes = zip({ "META-INF/MANIFEST.MF": "Manifest-Version: 1.0\r\nMain-Class: com.acme.Main\r\n" });
    expect(jarEntry(bytes, "META-INF/MANIFEST.MF")?.toString()).toContain("Main-Class");
    expect(mainClass(bytes)).toBe("com.acme.Main");
  });

  it.each([
    ["a missing entry", zip({ "a.txt": "x" }), "b.txt"],
    ["an unsupported compression method (bzip2)", withMethod("x", 12), "a.txt"],
    ["a corrupt local header", corruptLocalHeader(), "a.txt"],
    ["not a ZIP archive", Buffer.from("nope"), "a.txt"],
  ])("returns undefined for %s", (_, bytes, name) => {
    expect(jarEntry(bytes, name)).toBeUndefined();
  });

  it("inflates a deflated entry written by hand", () => {
    expect(jarEntry(withMethod(deflateRawSync("hello hello hello"), 8), "a.txt")?.toString()).toBe("hello hello hello");
  });

  it.each([
    ["no manifest", zip({ "a/B.class": "" })],
    ["a manifest without Main-Class", zip({ "META-INF/MANIFEST.MF": "Manifest-Version: 1.0\n" })],
  ])("has no main class with %s", (_, bytes) => {
    expect(mainClass(bytes)).toBeUndefined();
  });
});
