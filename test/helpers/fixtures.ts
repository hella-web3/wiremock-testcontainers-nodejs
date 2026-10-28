import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
