#!/usr/bin/env node
/**
 * `pnpm build:extensions [--check]` – packs the compiled WireMock extensions the tests and
 * `examples/` use into JARs, with Node.js alone: no JDK, no Java source.
 *
 *   test/__mocks__/extensions/<name>/classes/** compiled classes (Java 11) and resources (META-INF/services)
 *   test/__mocks__/extensions/<name>.jar the JAR, also copied to examples/__mocks__/extensions/
 *
 * Reproducible: entries are stored (uncompressed – deflate output varies between zlib builds),
 * sorted, with a fixed timestamp and a fixed manifest, so the same classes always give the same
 * bytes. `--check` writes nothing and fails if a JAR or a copy is out of date.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { crc32 } from "node:zlib";

const ROOT = "test/__mocks__/extensions";
const COPIES = ["examples/__mocks__/extensions"];
const MANIFEST = "Manifest-Version: 1.0\r\nCreated-By: wiremock-testcontainers-nodejs (pnpm build:extensions)\r\n\r\n";
/** MS-DOS date of 1980-01-01, the earliest a ZIP can hold; time 00:00. */
const DOS_DATE = (1 << 5) | 1;
/** Language encoding flag: names are UTF-8. */
const UTF8 = 0x08_00;

/** A JAR of stored entries: `[name, content]` in the given order. */
function jar(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const file = Buffer.from(name, "utf8");
    const checksum = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04_03_4b_50, 0);
    local.writeUInt16LE(20, 4); // version needed: 2.0
    local.writeUInt16LE(UTF8, 6);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(file.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02_01_4b_50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(UTF8, 8);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(file.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, file, content);
    centrals.push(central, file);
    offset += local.length + file.length + content.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06_05_4b_50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/** The files below `dir`, as sorted `/`-separated paths. */
const files = (dir) =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"))
    .toSorted();

const read = (path) => {
  try {
    return readFileSync(path);
  } catch {
    return undefined;
  }
};

function main() {
  const check = process.argv.includes("--check");
  const stale = [];
  const names = readdirSync(ROOT, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).toSorted();
  for (const name of names) {
    const classes = join(ROOT, name, "classes");
    const bytes = jar([["META-INF/MANIFEST.MF", Buffer.from(MANIFEST)], ...files(classes).map((file) => [file, readFileSync(join(classes, file))])]);
    for (const target of [join(ROOT, `${name}.jar`), ...COPIES.map((copy) => join(copy, `${name}.jar`))]) {
      if (read(target)?.equals(bytes)) continue;
      if (check) {
        stale.push(target);
        continue;
      }
      mkdirSync(join(target, ".."), { recursive: true });
      writeFileSync(target, bytes);
      console.log(`✔ ${target}`);
    }
  }
  if (stale.length > 0) {
    console.error(`✖ out of date: ${stale.join(", ")} – run \`pnpm build:extensions\``);
    process.exitCode = 1;
  } else if (check) {
    console.log("✔ extension JARs are up to date");
  }
}

main();
