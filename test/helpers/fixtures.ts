import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { WiremockContainer, type WiremockMappingSource, type WiremockStaticFile } from "../../src";

/** Container name used by the suites, so stray containers are easy to spot. */
export const WIREMOCK_CONTAINER_NAME = "wiremock-testcontainer";

/**
 * Directory containing the recorded WireMock session used by the test suites.
 * Relative to the project root, which is the working directory Vitest runs
 * from (and the same path that is passed to `WiremockContainer.withMappings`).
 */
export const WIREMOCK_FIXTURE_DIR = "./test/__mocks__/wiremock";
export const MAPPINGS_DIR = join(WIREMOCK_FIXTURE_DIR, "mappings");
export const FILES_DIR = join(WIREMOCK_FIXTURE_DIR, "__files");

/** Loose fixtures for `withMapping()` / `withFiles()`, outside WireMock's directory layout. */
const standalone = (name: string): string => join("./test/__mocks__/standalone", name);
export const STANDALONE = {
  health: standalone("mapping-health.json"), // GET /health → inline jsonBody
  transactions: standalone("mapping-transactions.json"), // GET /transactions → transactions/body-transactions.json
  transactionsBody: standalone("body-transactions.json"),
  greetings: standalone("mapping-greetings.json"), // { mappings }: GET /greeting → greeting.txt, GET /farewell
  greetingBody: standalone("greeting.txt"),
} as const;
/** `STANDALONE.health` relative to `test/unit/`, for `{ module: import.meta.url }` sources. */
export const HEALTH_FROM_UNIT_TESTS = "../__mocks__/standalone/mapping-health.json";
/** The same fixtures as absolute paths, unaffected by a mocked `process.cwd()`. */
export const ABSOLUTE = { fixtureDir: resolve(WIREMOCK_FIXTURE_DIR), health: resolve(STANDALONE.health), greeting: resolve(STANDALONE.greetingBody) };

// ---------------------------------------------------------------------------
// Container paths and registration factories
// ---------------------------------------------------------------------------

export const mappingsPath = (name: string): string => `/home/wiremock/mappings/${name}`;
export const filesPath = (name: string): string => `/home/wiremock/__files/${name}`;

/** Container files of `withMapping("health", STANDALONE.health)`: container path → source. */
export const HEALTH_IN_CONTAINER = { [mappingsPath("health.json")]: STANDALONE.health };

/** A minimal `GET <url>` stub, optionally with a stub `id`. */
export const stub = (url: string, id?: string) => ({ id, request: { method: "GET", url }, response: { status: 200, body: url } });

/** Expected container content of inline JSON: strings verbatim, values serialised with `indent`. */
export const jsonBytes = (value: unknown, indent?: number): Buffer =>
  Buffer.from(typeof value === "string" ? value : JSON.stringify(value, null, indent));

/** A registration applied to a container; factories accept `unknown` so invalid input can be passed. */
export type Register = (container: WiremockContainer) => unknown;
export const addMapping =
  (source: unknown, name: unknown = "x"): Register =>
  (container) => container.withMapping(name as string, source as WiremockMappingSource);
export const addFiles =
  (...files: unknown[]): Register =>
  (container) => container.withFiles(...(files as WiremockStaticFile[]));

/** A container using every kind of registration, from absolute paths so a mocked cwd cannot break it. */
export const populatedContainer = (): WiremockContainer =>
  new WiremockContainer()
    .withMappings(ABSOLUTE.fixtureDir)
    .withMapping("health", ABSOLUTE.health)
    .withMapping("ping", { json: stub("/ping") })
    .withFiles(ABSOLUTE.greeting);

// ---------------------------------------------------------------------------
// Scratch project: invalid and clashing sources plus fake npm packages
// ---------------------------------------------------------------------------

/** Recorded fixtures the scratch files collide with. */
export const CARDS_MAPPING = join(MAPPINGS_DIR, "mapping-cards-FA6eA.json");
export const CARDS_ID: string = JSON.parse(readFileSync(CARDS_MAPPING, "utf8")).id;
export const CARDS_BODY = "body-cards-FA6eA.json";

/** Unique per test file; nothing is written until {@link writeScratchProject}. */
export const SCRATCH_DIR = join(tmpdir(), `wiremock-test-${randomUUID()}`);
const scratch = (path: string): string => join(SCRATCH_DIR, path);
export const SCRATCH = {
  invalidJson: scratch("bad.json"),
  notAStub: scratch("not-a-stub.json"),
  binary: scratch("logo.png"),
  /** Same base name, different content. */
  sameNameA: scratch("a/dup.txt"),
  sameNameB: scratch("b/dup.txt"),
  /** A body named like the recorded `CARDS_BODY`. */
  cardsBodyImpostor: scratch(`impostor/${CARDS_BODY}`),
  /** Rewritten by the snapshot test after registration. */
  mutableMapping: scratch("snapshot/mutable.json"),
  /** Directories for `withMappings()` that clash with `populatedContainer()`. */
  dirWithHealthMapping: scratch("clash-mapping"),
  dirWithGreetingBody: scratch("clash-body"),
  dirReusingCardsId: scratch("clash-id"),
  /** Installed packages: `@acme/fixtures`, `plain` and `outside` (a sibling to escape into). */
  packages: { scoped: "@acme/fixtures", plain: "plain" },
} as const;

/** Writes each file – path → string, Buffer or JSON-serialised value – creating directories. */
export function writeFiles(files: Record<string, string | Buffer | object>): void {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, typeof content === "string" || Buffer.isBuffer(content) ? content : JSON.stringify(content));
  }
}

/** An npm package below `<project>/node_modules` whose `exports` deliberately hide its fixtures. */
export function writePackage(project: string, name: string, files: Record<string, string | object>): void {
  const root = join(project, "node_modules", name);
  const all = { "package.json": { name, exports: { "./package.json": "./package.json" } }, ...files };
  writeFiles(Object.fromEntries(Object.entries(all).map(([path, content]) => [join(root, path), content])));
}

const read = (path: string): string => readFileSync(path, "utf8");

/** Writes {@link SCRATCH} and its packages; call in `beforeAll`, remove {@link SCRATCH_DIR} in `afterAll`. */
export function writeScratchProject(): void {
  writeFiles({
    [SCRATCH.invalidJson]: "{ not json",
    [SCRATCH.notAStub]: { name: "pkg" },
    [SCRATCH.binary]: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]),
    [SCRATCH.sameNameA]: "a",
    [SCRATCH.sameNameB]: "b",
    [SCRATCH.cardsBodyImpostor]: "{}",
    [SCRATCH.mutableMapping]: stub("/v1"),
    [join(SCRATCH.dirWithHealthMapping, "mappings/health.json")]: stub("/clash"),
    [join(SCRATCH.dirWithGreetingBody, "mappings/ok.json")]: stub("/ok"),
    [join(SCRATCH.dirWithGreetingBody, "mappings/README.md")]: "not a mapping",
    [join(SCRATCH.dirWithGreetingBody, "__files/greeting.txt")]: "Hi",
    [join(SCRATCH.dirReusingCardsId, "mappings/cards.json")]: stub("/cards-again", CARDS_ID),
  });
  writePackage(SCRATCH_DIR, SCRATCH.packages.scoped, { "wiremock/health.json": read(STANDALONE.health), "wiremock/body.json": read(STANDALONE.transactionsBody) });
  writePackage(SCRATCH_DIR, SCRATCH.packages.plain, { "greetings.json": read(STANDALONE.greetings) });
  writePackage(SCRATCH_DIR, "outside", { "secret.json": stub("/secret") });
}

/** Registers `withMapping()` and `withFiles()` sources from the scratch packages. */
export const packageBackedContainer = (): WiremockContainer =>
  new WiremockContainer()
    .withMapping("health", { package: SCRATCH.packages.scoped, file: "wiremock/health.json" })
    .withMapping("plain", { package: SCRATCH.packages.plain, file: "./greetings.json" })
    .withFiles({ package: SCRATCH.packages.scoped, file: "wiremock/body.json", name: "t/body.json" });

// ---------------------------------------------------------------------------
// WireMock shapes
// ---------------------------------------------------------------------------

/** The subset of a WireMock stub mapping file that the tests rely on. */
export interface WiremockMapping {
  id: string;
  /** Lower wins. Only set on hand-written error stubs that shadow a recorded URL. */
  priority?: number;
  request: {
    url: string;
    method: string;
    /** Request headers that must match for the stub to be served. */
    headers?: Record<string, { equalTo: string }>;
  };
  response: { status: number; bodyFileName: string; headers: Record<string, string> };
  uuid: string;
}

/** `GET /__admin/mappings` from the WireMock admin API. */
export interface AdminMappingsResponse {
  mappings: WiremockMapping[];
  meta: { total: number };
}

/** A mapping paired with the parsed body file it references. */
export interface LoadedMapping<T = unknown> {
  /** File name inside `mappings/`, e.g. `mapping-cards-FA6eA.json`. */
  fileName: string;
  mapping: WiremockMapping;
  /** Parsed JSON content of `__files/<bodyFileName>`. */
  body: T;
}

// ---------------------------------------------------------------------------
// Captured response bodies
// ---------------------------------------------------------------------------

export interface SpendControlAmount {
  dailySpent: string;
  weeklySpent: string;
  monthlySpent: string;
  yearlySpent: string;
  allTimeSpent: string;
}

export interface SpendControlCap {
  transactionLimit: string;
  dailyLimit: string;
  weeklyLimit: string;
  monthlyLimit: string;
  yearlyLimit: string;
  allTimeLimit: string;
}

export interface AtmControl {
  dailyFrequency: string;
  monthlyFrequency: string;
  yearlyFrequency: string;
  dailyWithdrawal: string;
  monthlyWithdrawal: string;
  yearlyWithdrawal: string;
}

export interface SpendControl {
  spendControlAmount: SpendControlAmount;
  spendControlCap: SpendControlCap;
  atmControl: AtmControl;
}

export interface ShippingInformation {
  bulkShippingID: string | null;
  sku: string | null;
}

export interface OtpPhoneNumber {
  dialCode: number;
  phoneNumber: string;
}

export interface CardMeta {
  id: string;
  email: string;
  otpPhoneNumber: OtpPhoneNumber;
}

export interface Card {
  id: string;
  cardName: string;
  secondaryCardName: string;
  last4: string;
  cardType: string;
  availableCredit: string;
  status: string;
  physicalCardStatus: string;
  shippingAddress: unknown;
  spendControl: SpendControl;
  cardDesign: string;
  threeDSForwarding: boolean;
  shippingInformation: ShippingInformation;
  bulkShippingID: string | null;
  meta: CardMeta;
}

export interface PaginationMeta {
  totalItems: number;
  itemCount: number;
  itemsPerPage: number;
  totalPages: number;
  currentPage: number;
}

/** Body of `GET /cards` (`__files/body-cards-FA6eA.json`). */
export interface CardsResponse {
  items: Card[];
  meta: PaginationMeta;
}

/** Body of `GET /account/balance` (`__files/body-account-balance-zstDt.json`). */
export interface AccountBalanceResponse {
  availableBalance: number;
  availableToAllocate: number;
}

/** Error envelope returned by the API for 4xx/5xx responses. */
export interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const listJsonFiles = (dir: string): string[] =>
  readdirSync(dir).filter((name) => name.endsWith(".json")).toSorted();

/** Sorted file names inside `mappings/`. */
export const listMappingFiles = (): string[] => listJsonFiles(MAPPINGS_DIR);

/** Sorted file names inside `__files/`. */
export const listBodyFiles = (): string[] => listJsonFiles(FILES_DIR);

/**
 * Loads every mapping under `mappings/` together with the body file it points
 * to. Drives one test per recorded endpoint, so adding a mapping to the
 * fixture directory automatically adds it to the E2E contract suite.
 */
export const loadAllMappings = (): LoadedMapping[] =>
  listMappingFiles().map((fileName) => {
    const mapping = readJson<WiremockMapping>(join(MAPPINGS_DIR, fileName));
    return { fileName, mapping, body: readJson(join(FILES_DIR, mapping.response.bodyFileName)) };
  });

/** Mappings that serve a 4xx/5xx error envelope. */
export const isErrorMapping = ({ mapping }: LoadedMapping): boolean => mapping.response.status >= 400;

/** Plain request headers to send so that `mapping` matches, e.g. `{ "X-Mock-Scenario": "server-error" }`. */
export const requestHeaders = (mapping: WiremockMapping): Record<string, string> =>
  Object.fromEntries(
    Object.entries(mapping.request.headers ?? {}).map(([name, { equalTo }]) => [name, equalTo]),
  );

/**
 * Finds the mapping that serves `method url` with the given response status
 * (default 200), typed by its body `T`.
 */
export function findMapping<T>(method: string, url: string, status = 200): LoadedMapping<T> {
  const match = loadAllMappings().find(
    ({ mapping }) =>
      mapping.request.method === method &&
      mapping.request.url === url &&
      mapping.response.status === status,
  );
  if (!match) throw new Error(`No mapping found for ${method} ${url} → ${status} in ${MAPPINGS_DIR}`);
  return match as LoadedMapping<T>;
}

/** Every recorded file as mounted by `withMappings(WIREMOCK_FIXTURE_DIR)`: container path → source. */
export const RECORDED_IN_CONTAINER: Record<string, string> = Object.fromEntries([
  ...listMappingFiles().map((name) => [mappingsPath(name), join(MAPPINGS_DIR, name)]),
  ...listBodyFiles().map((name) => [filesPath(name), join(FILES_DIR, name)]),
]);
