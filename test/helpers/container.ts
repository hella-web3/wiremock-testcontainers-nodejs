import { readFileSync } from "node:fs";
import type { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";
import type { GenericContainer } from "testcontainers";
import { expect, it } from "vitest";
import { populatedContainer, type Register } from "./fixtures";

/**
 * The files `start()` would upload to the container – container path → content – read from
 * the real tar archive Testcontainers builds. Entries are short ustar paths, so no pax
 * handling is needed. Throws when a path is written twice with different content: clobbering.
 */
export async function containerFiles(container: GenericContainer): Promise<Record<string, Buffer>> {
  const archive = await (container as unknown as { createArchiveToCopyToContainer(): Promise<Readable & { finalize(): void }> })
    .createArchiveToCopyToContainer();
  archive.finalize();
  const tar = await buffer(archive);
  const files: Record<string, Buffer> = {};
  for (let at = 0, size = 0; tar[at]; at += 512 + Math.ceil(size / 512) * 512) {
    const field = (start: number, length: number) => tar.toString("utf8", at + start, at + start + length).replace(/\0.*$/su, "");
    const [path, content] = [`/${field(0, 100)}`, tar.subarray(at + 512, at + 512 + (size = Number.parseInt(field(124, 12), 8)))];
    if (files[path] && !files[path].equals(content)) throw new Error(`${path} is overwritten with different content`);
    files[path] = content;
  }
  return files;
}

/** Targets of every copy registered on the builder so far – a cheap fingerprint of its state. */
export const pendingCopies = (container: GenericContainer): string[] =>
  (["directoriesToCopy", "filesToCopy", "contentsToCopy"] as const).flatMap((kind) =>
    (container as unknown as Record<typeof kind, { target: string }[]>)[kind].map(({ target }) => `${kind}:${target}`),
  );

/** Asserts the container receives exactly `expected`: container path → source path, or literal content as a Buffer. */
export async function expectFiles(container: GenericContainer, expected: Record<string, string | Buffer>): Promise<void> {
  const contents = Object.entries(expected).map(([path, source]) => [path, Buffer.isBuffer(source) ? source : readFileSync(source)]);
  expect(await containerFiles(container)).toEqual(Object.fromEntries(contents));
}

/**
 * One test per case – `case name → [registration, expected error message]`: applied to
 * `populatedContainer()`, the registration must throw that message and leave the builder unchanged.
 */
export const rejects = (cases: Record<string, [Register, string]>): void => {
  for (const [name, [register, message]] of Object.entries(cases)) {
    it(`rejects ${name}: throws '${message}' and registers nothing`, () => {
      const container = populatedContainer();
      const before = pendingCopies(container);
      expect(() => register(container)).toThrow(message);
      expect(pendingCopies(container)).toEqual(before);
    });
  }
};
