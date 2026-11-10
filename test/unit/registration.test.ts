import { readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { StartedWiremockContainer, WiremockContainer, type WiremockMappingSource } from "../../src";
import { expectFiles, rejects } from "../helpers/container";
import {
  ABSOLUTE,
  addFiles,
  addMapping,
  CARDS_BODY,
  CARDS_ID,
  CARDS_MAPPING,
  FILES_DIR,
  filesPath,
  HEALTH_FROM_UNIT_TESTS,
  HEALTH_IN_CONTAINER,
  jsonBytes,
  mappingsPath,
  packageBackedContainer,
  RECORDED_IN_CONTAINER,
  SCRATCH,
  SCRATCH_DIR,
  STANDALONE as S,
  stub,
  WIREMOCK_FIXTURE_DIR,
  writeScratchProject,
} from "../helpers/fixtures";

/**
 * `withMapping()`, `withFiles()` and their interplay with `withMappings()`, without Docker:
 * assertions run against the files the container would receive (see `containerFiles`).
 */

beforeAll(writeScratchProject);
afterEach(() => vi.restoreAllMocks());
afterAll(() => rmSync(SCRATCH_DIR, { recursive: true, force: true }));

describe("WiremockContainer.withMapping(name, source) → /home/wiremock/mappings/<name>.json", () => {
  it.each(
    Object.entries<WiremockMappingSource>({
      "a relative path": S.health,
      "an absolute path": resolve(S.health),
      "a file: URL object": pathToFileURL(resolve(S.health)),
      "a file: URL string": pathToFileURL(resolve(S.health)).href,
      "{ file: path }": { file: S.health },
      "{ module: import.meta.url, file }": { module: import.meta.url, file: HEALTH_FROM_UNIT_TESTS },
      "{ module: __filename, file }": { module: fileURLToPath(import.meta.url), file: HEALTH_FROM_UNIT_TESTS },
      "{ module: __dirname, file }": { module: fileURLToPath(new URL(".", import.meta.url)), file: HEALTH_FROM_UNIT_TESTS },
    }),
  )("source %s: copies mapping-health.json byte-for-byte to mappings/health.json", (_, source) =>
    expectFiles(new WiremockContainer().withMapping("health", source), HEALTH_IN_CONTAINER));

  it("names: appends .json unless present, keeps sub-directories (a/b → a/b.json), accepts multi-stub files", () =>
    expectFiles(
      new WiremockContainer().withMapping("health.json", S.health).withMapping("a/b", S.transactions).withMapping("greetings", S.greetings),
      { ...HEALTH_IN_CONTAINER, [mappingsPath("a/b.json")]: S.transactions, [mappingsPath("greetings.json")]: S.greetings },
    ));

  it("inline { json }: serialises a frozen object (unmodified) with 2-space indent, copies a JSON string verbatim", () => {
    const [ping, many] = [Object.freeze(stub("/ping")), JSON.stringify({ mappings: [stub("/a"), stub("/b")] })];
    return expectFiles(new WiremockContainer().withMapping("ping", { json: ping }).withMapping("many", { json: many }), {
      [mappingsPath("ping.json")]: jsonBytes(ping, 2),
      [mappingsPath("many.json")]: jsonBytes(many),
    });
  });

  it("snapshots the file at registration: a later edit of the source (/v1 → /v2) is not copied", async () => {
    const container = new WiremockContainer().withMapping("mutable", SCRATCH.mutableMapping);
    writeFileSync(SCRATCH.mutableMapping, JSON.stringify(stub("/v2")));
    await expectFiles(container, { [mappingsPath("mutable.json")]: jsonBytes(stub("/v1")) });
  });

  rejects({
    "an empty name": [addMapping(S.health, ""), '"name" must be a non-empty string'],
    "a non-string name (42)": [addMapping(S.health, 42), '"name" must be a non-empty string, got 42'],
    "a name with a '..' segment": [addMapping(S.health, "../x"), 'name "../x" must be a relative path'],
    "a name with a backslash": [addMapping(S.health, "a\\b"), "must be a relative path"],
    "a missing file": [addMapping("./nope.json"), `WiremockContainer.withMapping("x"): "${resolve("nope.json")}" does not exist`],
    "a directory as source": [addMapping(dirname(S.health)), "is not a file"],
    "an empty path": [addMapping(""), '"source" must be a non-empty string'],
    "an https: URL": [addMapping(new URL("https://example.com/a.json")), '"source" must be a path or a file: URL'],
    "a null source": [addMapping(null), "unsupported source null"],
    "an array source": [addMapping([]), "unsupported source []"],
    "an object without file": [addMapping({}), '"file" must be a non-empty string'],
    "package and module together": [addMapping({ package: "a", module: import.meta.url, file: "a" }), 'may set "package" or "module", not both'],
    "a non-string module": [addMapping({ module: 1, file: "a" }), '"module" must be a non-empty string'],
    "a file with invalid JSON": [addMapping(SCRATCH.invalidJson), `${SCRATCH.invalidJson}: invalid JSON`],
    "a JSON file that is not a stub": [addMapping(SCRATCH.notAStub), 'the mapping is not a WireMock stub mapping ("request" and "response" objects are required)'],
    "an inline stub without response": [addMapping({ json: { request: {} } }), "inline JSON: the mapping is not a WireMock stub mapping"],
    "unserialisable inline JSON (undefined)": [addMapping({ json: undefined }), '"json" must be a JSON string or an object'],
    "an empty { mappings: [] }": [addMapping({ json: { mappings: [] } }), '"mappings" must be a non-empty array'],
    "an invalid stub inside { mappings }": [addMapping({ json: { mappings: [stub("/a"), {}] } }), "mappings[1] is not a WireMock stub mapping"],
  });
});

describe("withMapping() / withFiles() with { package, file } sources, resolved from the working directory", () => {
  beforeEach(() => vi.spyOn(process, "cwd").mockReturnValue(SCRATCH_DIR));

  it("reads files the package does not export, from the project root and from a nested packages/service cwd", async () => {
    const expected = { ...HEALTH_IN_CONTAINER, [mappingsPath("plain.json")]: S.greetings, [filesPath("t/body.json")]: S.transactionsBody };
    await expectFiles(packageBackedContainer(), expected);
    vi.mocked(process.cwd).mockReturnValue(join(SCRATCH_DIR, "packages", "service"));
    await expectFiles(packageBackedContainer(), expected);
  });

  it("reads node_modules/testcontainers/package.json from the real, pnpm-installed dependency", () => {
    vi.mocked(process.cwd).mockRestore();
    const container = new WiremockContainer().withFiles({ package: "testcontainers", file: "package.json" });
    return expectFiles(container, { [filesPath("package.json")]: "node_modules/testcontainers/package.json" });
  });

  rejects({
    "a package that is not installed": [addMapping({ package: "@acme/missing", file: "a.json" }), 'package "@acme/missing" is not installed'],
    "a Node.js built-in module (fs)": [addMapping({ package: "fs", file: "package.json" }), 'package "fs" is not installed'],
    "an invalid package name (../outside)": [addMapping({ package: "../outside", file: "secret.json" }), '"../outside" is not a valid npm package name'],
    "a file escaping the package (../../outside/secret.json)": [
      addMapping({ package: SCRATCH.packages.scoped, file: "../../outside/secret.json" }),
      `must point to a file inside package "${SCRATCH.packages.scoped}"`,
    ],
    "a file missing from the package": [addMapping({ package: SCRATCH.packages.scoped, file: "nope.json" }), 'nope.json" does not exist'],
  });
});

describe("WiremockContainer.withFiles(...files) → /home/wiremock/__files/<name>", () => {
  it("copies a path, a binary file, { file, name } and { module, file, name } as-is, under their base name or `name`", () =>
    expectFiles(
      new WiremockContainer().withFiles(
        S.greetingBody,
        SCRATCH.binary,
        { file: S.transactionsBody, name: "t/body.json" },
        { module: import.meta.url, file: "../__mocks__/standalone/greeting.txt", name: "hello.txt" },
      ),
      {
        [filesPath("greeting.txt")]: S.greetingBody,
        [filesPath("logo.png")]: SCRATCH.binary,
        [filesPath("t/body.json")]: S.transactionsBody,
        [filesPath("hello.txt")]: S.greetingBody,
      },
    ));

  it("withFiles() without arguments registers nothing", () => expectFiles(new WiremockContainer().withFiles(), {}));

  it("all or nothing: after withFiles(a/dup.txt, b/dup.txt) is rejected, b/dup.txt alone can still be registered", () => {
    const container = new WiremockContainer();
    expect(() => container.withFiles(SCRATCH.sameNameA, SCRATCH.sameNameB)).toThrow(`"${filesPath("dup.txt")}" is already registered from ${SCRATCH.sameNameA}`);
    return expectFiles(container.withFiles(SCRATCH.sameNameB), { [filesPath("dup.txt")]: SCRATCH.sameNameB });
  });

  rejects({
    "a missing file": [addFiles("./nope.txt"), `WiremockContainer.withFiles: "${resolve("nope.txt")}" does not exist`],
    "a directory": [addFiles(dirname(S.greetingBody)), "is not a file"],
    "a name with a '..' segment": [addFiles({ file: S.transactionsBody, name: "../x" }), 'name "../x" must be a relative path'],
    "an unsupported source (false) after a valid one": [addFiles(S.transactionsBody, false), "unsupported source false"],
  });
});

describe("withMappings(dir) + withMapping() + withFiles() on one container: no registration overwrites another", () => {
  it("places the recorded directory, two named mappings and two static files side by side; no source file changes", async () => {
    const sources = [...Object.values(RECORDED_IN_CONTAINER), ...Object.values(S)];
    const fingerprint = () => sources.map((path) => [readFileSync(path), statSync(path).mtimeMs]);
    const before = fingerprint();
    await expectFiles(
      new WiremockContainer()
        .withMappings(WIREMOCK_FIXTURE_DIR)
        .withMapping("health", S.health)
        .withMapping("greetings", S.greetings)
        .withFiles(S.greetingBody, { file: S.transactionsBody, name: "transactions/body-transactions.json" }),
      {
        ...RECORDED_IN_CONTAINER,
        ...HEALTH_IN_CONTAINER,
        [mappingsPath("greetings.json")]: S.greetings,
        [filesPath("greeting.txt")]: S.greetingBody,
        [filesPath("transactions/body-transactions.json")]: S.transactionsBody,
      },
    );
    expect(fingerprint()).toEqual(before);
  });

  it("re-registering the same file at the same container path (directory, mapping or static file) is a no-op", () =>
    expectFiles(
      new WiremockContainer()
        .withMappings(WIREMOCK_FIXTURE_DIR)
        .withMappings(`${WIREMOCK_FIXTURE_DIR}/`)
        .withMapping("mapping-cards-FA6eA", CARDS_MAPPING)
        .withMapping("health", S.health)
        .withMapping("health", resolve(S.health))
        .withFiles(S.greetingBody, S.greetingBody),
      { ...RECORDED_IN_CONTAINER, ...HEALTH_IN_CONTAINER, [filesPath("greeting.txt")]: S.greetingBody },
    ));

  rejects({
    "inline JSON at the path of a mounted mapping": [
      addMapping({ json: stub("/x") }, "mapping-cards-FA6eA"),
      `"${mappingsPath("mapping-cards-FA6eA.json")}" is already registered from ${resolve(CARDS_MAPPING)}; registering inline JSON would overwrite it`,
    ],
    "a directory whose mappings/health.json clashes with withMapping('health')": [
      (c) => c.withMappings(SCRATCH.dirWithHealthMapping),
      `WiremockContainer.withMappings: "${mappingsPath("health.json")}" is already registered from ${ABSOLUTE.health}`,
    ],
    "a directory whose __files/greeting.txt clashes with withFiles()": [
      (c) => c.withMappings(SCRATCH.dirWithGreetingBody),
      `"${filesPath("greeting.txt")}" is already registered from ${ABSOLUTE.greeting}`,
    ],
    "a static file clashing with a mounted body": [addFiles(SCRATCH.cardsBodyImpostor), `is already registered from ${resolve(FILES_DIR, CARDS_BODY)}`],
    "a second inline mapping named 'ping'": [addMapping({ json: stub("/ping") }, "ping"), `"${mappingsPath("ping.json")}" is already registered from inline JSON`],
    "a mapping reusing the stub id of a mounted mapping": [
      addMapping(CARDS_MAPPING, "cards-copy"),
      `stub id "${CARDS_ID}" in ${resolve(CARDS_MAPPING)} is already used by "${mappingsPath("mapping-cards-FA6eA.json")}"; WireMock refuses to start with duplicate stub ids`,
    ],
    "a directory reusing the stub id of a mounted mapping": [(c) => c.withMappings(SCRATCH.dirReusingCardsId), `stub id "${CARDS_ID}"`],
    "a stub id repeated within one { mappings } file": [
      addMapping({ json: { mappings: [stub("/a", "dup"), stub("/b", "dup")] } }, "twice"),
      `stub id "dup" in inline JSON is already used by "${mappingsPath("twice.json")}"`,
    ],
  });

  it("chains with GenericContainer builders (withName, withCommand) and start() resolves to a StartedWiremockContainer", async () => {
    const fake = { getHost: () => "localhost", getMappedPort: () => 32768 } as unknown as StartedTestContainer;
    vi.spyOn(GenericContainer.prototype, "start").mockResolvedValue(fake);
    const container = new WiremockContainer();
    const chained = container.withName("wm").withMappings(WIREMOCK_FIXTURE_DIR).withMapping("health", S.health).withFiles(S.greetingBody);
    expect(chained.withCommand(["--verbose"])).toBe(container);
    const started = await container.start();
    expect(started).toBeInstanceOf(StartedWiremockContainer);
    expect(started.rpcUrl).toBe("http://localhost:32768");
  });
});
