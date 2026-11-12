import { inflateRawSync } from "node:zlib";

/** A JAR (ZIP) entry: its name and where its local header starts. */
interface ZipEntry {
  readonly name: string;
  readonly method: number;
  readonly size: number;
  readonly offset: number;
}

const EOCD = Buffer.from("PK\u0005\u0006", "latin1");
const ZIP64_LOCATOR = 0x07_06_4b_50;
const CENTRAL = 0x02_01_4b_50;
const LOCAL = 0x04_03_4b_50;

/**
 * The entries of a JAR, read from its central directory – no dependency, no inflating.
 * @throws If `bytes` is not a ZIP archive.
 */
export function jarEntries(bytes: Buffer): ZipEntry[] {
  // The end-of-central-directory record: 22 bytes, then a comment of up to 64 KiB.
  const eocd = bytes.length < 22 ? -1 : bytes.lastIndexOf(EOCD, bytes.length - 22);
  if (eocd < 0 || eocd < bytes.length - 22 - 0xff_ff) throw new Error("not a ZIP archive");
  let count = bytes.readUInt16LE(eocd + 10);
  let at = bytes.readUInt32LE(eocd + 16);
  const locator = eocd - 20;
  if (locator >= 0 && bytes.readUInt32LE(locator) === ZIP64_LOCATOR) {
    const record = Number(bytes.readBigUInt64LE(locator + 8));
    count = Number(bytes.readBigUInt64LE(record + 32));
    at = Number(bytes.readBigUInt64LE(record + 48));
  }
  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index++) {
    if (at + 46 > bytes.length || bytes.readUInt32LE(at) !== CENTRAL) throw new Error("corrupt ZIP central directory");
    const nameLength = bytes.readUInt16LE(at + 28);
    const name = bytes.toString("utf8", at + 46, at + 46 + nameLength);
    entries.push({ name, method: bytes.readUInt16LE(at + 10), size: bytes.readUInt32LE(at + 20), offset: bytes.readUInt32LE(at + 42) });
    at += 46 + nameLength + bytes.readUInt16LE(at + 30) + bytes.readUInt16LE(at + 32);
  }
  return entries;
}

/** The content of entry `name` (stored or deflated), or `undefined` if absent or unreadable. */
export function jarEntry(bytes: Buffer, name: string): Buffer | undefined {
  try {
    const entry = jarEntries(bytes).find((candidate) => candidate.name === name);
    if (!entry || bytes.readUInt32LE(entry.offset) !== LOCAL) return undefined;
    const start = entry.offset + 30 + bytes.readUInt16LE(entry.offset + 26) + bytes.readUInt16LE(entry.offset + 28);
    const data = bytes.subarray(start, start + entry.size);
    if (entry.method === 0) return data;
    return entry.method === 8 ? inflateRawSync(data) : undefined;
  } catch {
    return undefined;
  }
}

/** The `Main-Class` of a JAR's manifest, if any. */
export function mainClass(bytes: Buffer): string | undefined {
  const manifest = jarEntry(bytes, "META-INF/MANIFEST.MF")?.toString("utf8");
  return manifest && /^Main-Class:\s*(\S+)\s*$/mu.exec(manifest)?.[1];
}
