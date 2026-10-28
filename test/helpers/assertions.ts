import { expect } from "vitest";
import type {
  AccountBalanceResponse,
  AdminMappingsResponse,
  AtmControl,
  Card,
  CardMeta,
  CardsResponse,
  ErrorResponse,
  OtpPhoneNumber,
  PaginationMeta,
  ShippingInformation,
  SpendControl,
  SpendControlAmount,
  SpendControlCap,
  WiremockMapping,
} from "./fixtures";

/**
 * Schema-driven assertions shared by the unit suite (run against the fixture
 * files) and the E2E suite (run against the live WireMock container).
 *
 * A `Schema<T>` must supply a {@link Check} for **every** key of `T`, so the
 * compiler guarantees each field of a JSON payload has an assertion.
 * {@link expectObject} verifies, per field, the expected shape *and* equality
 * with the recorded fixture, and that the object carries exactly the declared
 * keys.
 *
 * Adding an endpoint: (1) drop the recorded `mapping-*.json` + `body-*.json`
 * into `test/__mocks__/wiremock` – the mapping-driven E2E test picks it up
 * automatically; (2) declare its body interface in `fixtures.ts`; (3) write a
 * `Schema<T>` below – the compiler lists any field you forget; (4) call
 * `expectObject(actual, fixture, schema)` from the unit and E2E suites.
 */

// ---------------------------------------------------------------------------
// Regular expressions
// ---------------------------------------------------------------------------

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
/** Two-decimal monetary string, e.g. `"0.00"`. */
export const MONEY_REGEX = /^\d+\.\d{2}$/u;
export const LAST4_REGEX = /^\d{4}$/u;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
export const DIGITS_REGEX = /^\d+$/u;
/** Lower-case identifier, e.g. `virtual`. */
export const LOWER_IDENT_REGEX = /^[a-z]+$/u;
/** Upper-case enum-style identifier, e.g. `ACTIVE`, `NOT_PHYSICAL_CARD`. */
export const UPPER_ENUM_REGEX = /^[A-Z][A-Z_]*$/u;
export const HTTP_METHOD_REGEX = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/u;
/** Absolute URL path with optional query string as recorded in a mapping, e.g. `/cards?page=0`. */
export const URL_PATH_REGEX = /^\/[a-z/]+(\?[\w=&-]+)?$/u;
/** Body file name as written by the WireMock recorder, e.g. `body-cards-FA6eA.json`. */
export const BODY_FILE_NAME_REGEX = /^body-.*\.json$/u;

// ---------------------------------------------------------------------------
// Generic building blocks
// ---------------------------------------------------------------------------

/** Asserts the shape of `actual`; `expected` is the recorded fixture value. */
export type Check<T> = ((actual: T, expected: T) => void) & {
  /** Set by {@link optional}: the field may be absent from the object. */
  readonly optional?: true;
};

/** One {@link Check} per key of `T` – no field may be left unasserted. */
export type Schema<T> = { [K in keyof T]-?: Check<T[K]> };

const isPrimitive = (value: unknown): boolean => value === null || typeof value !== "object";

/**
 * Runs `check` and, for primitive values, asserts equality with the fixture.
 * Containers recurse through {@link objectOf}/{@link arrayOf}/{@link recordOf}
 * until primitives are reached, so equality is always verified at the leaves
 * while `partialOf` can tolerate extra keys at any depth.
 */
const verify = <T>(check: Check<T>, actual: T, expected: T): void => {
  check(actual, expected);
  if (isPrimitive(actual)) expect(actual).toEqual(expected);
};

/**
 * Asserts that every field declared in `schema` passes its check and equals
 * the corresponding field of `expected`. With `exact` (the default) `actual`
 * must also carry exactly the schema's keys – use {@link partialOf} for
 * responses whose full shape is owned by a third party.
 */
export function expectObject<T extends object>(
  actual: T,
  expected: T,
  schema: Schema<T>,
  exact = true,
): void {
  expect(actual).toEqual(expect.any(Object));
  const declared = Object.keys(schema) as (keyof T & string)[];
  if (exact) for (const key of Object.keys(actual)) expect(declared, `undeclared field "${key}"`).toContain(key);
  for (const key of declared) {
    if (!(key in actual) && schema[key].optional) continue;
    expect(actual, `missing field "${key}"`).toHaveProperty(key);
    verify(schema[key], actual[key], expected[key]);
  }
}

/** Shape-only variant of {@link expectObject}: `actual` is compared to itself. */
export const expectShape = <T extends object>(actual: T, schema: Schema<T>): void =>
  expectObject(actual, actual, schema);

/** Lifts a {@link Schema} into a {@link Check} for nesting (exact keys). */
export const objectOf =
  <T extends object>(schema: Schema<T>): Check<T> =>
  (actual, expected) =>
    expectObject(actual, expected, schema);

/** Like {@link objectOf} but tolerates additional, undeclared keys. */
export const partialOf =
  <T extends object>(schema: Schema<T>): Check<T> =>
  (actual, expected) =>
    expectObject(actual, expected, schema, false);

/** Checks an array element-wise and positionally against the fixture. */
export const arrayOf =
  <T>(item: Check<T>): Check<T[]> =>
  (actual, expected) => {
    expect(actual).toHaveLength(expected.length);
    actual.forEach((value, index) => verify(item, value, expected[index]));
  };

/** Checks every value of a string-keyed record. */
export const recordOf =
  <T>(value: Check<T>): Check<Record<string, T>> =>
  (actual, expected) => {
    expect(Object.keys(actual).toSorted()).toEqual(Object.keys(expected).toSorted());
    for (const key of Object.keys(actual)) verify(value, actual[key], expected[key]);
  };

/** Marks a field as optional: checked only when present. */
export const optional = <T>(check: Check<T>): Check<T | undefined> =>
  Object.assign(
    (actual: T | undefined, expected: T | undefined): void => {
      if (actual === undefined) expect(expected).toBeUndefined();
      else check(actual, expected as T);
    },
    { optional: true as const },
  );

/** Accepts `null`; otherwise delegates to `check`. */
export const nullable =
  <T>(check: Check<T>): Check<T | null> =>
  (actual, expected) => {
    if (actual === null) expect(expected).toBeNull();
    else check(actual, expected as T);
  };

// Leaf checks – shape only; equality with the fixture is asserted by `verify`.

export const matching =
  (regex: RegExp): Check<string> =>
  (actual) =>
    expect(actual).toMatch(regex);

export const anyString: Check<string> = (actual) => expect(actual).toEqual(expect.any(String));
export const nonEmptyString: Check<string> = (actual) => expect(actual).toMatch(/./u);
export const boolean: Check<boolean> = (actual) => expect(actual).toEqual(expect.any(Boolean));
export const nonNegativeNumber: Check<number> = (actual) => {
  expect(Number.isFinite(actual)).toBe(true);
  expect(actual).toBeGreaterThanOrEqual(0);
};
export const integerBetween =
  (min: number, max: number): Check<number> =>
  (actual) => {
    expect(Number.isInteger(actual)).toBe(true);
    expect(actual).toBeGreaterThanOrEqual(min);
    expect(actual).toBeLessThanOrEqual(max);
  };
export const nonNegativeInteger = integerBetween(0, Number.MAX_SAFE_INTEGER);
export const positiveInteger = integerBetween(1, Number.MAX_SAFE_INTEGER);
export const httpStatus = integerBetween(100, 599);
export const httpErrorStatus = integerBetween(400, 599);
/** Field must be present (may be `null` or an opaque object) and equal the fixture. */
export const present: Check<unknown> = (actual, expected) => {
  expect(actual).toBeDefined();
  expect(actual).toEqual(expected);
};

export const money = matching(MONEY_REGEX);
export const uuid = matching(UUID_REGEX);

// ---------------------------------------------------------------------------
// Payload schemas – keys are listed in the order they appear in the fixtures
// ---------------------------------------------------------------------------

const spendControlAmountSchema: Schema<SpendControlAmount> = {
  dailySpent: money,
  weeklySpent: money,
  monthlySpent: money,
  yearlySpent: money,
  allTimeSpent: money,
};

const spendControlCapSchema: Schema<SpendControlCap> = {
  transactionLimit: money,
  dailyLimit: money,
  weeklyLimit: money,
  monthlyLimit: money,
  yearlyLimit: money,
  allTimeLimit: money,
};

const atmControlSchema: Schema<AtmControl> = {
  dailyFrequency: money,
  monthlyFrequency: money,
  yearlyFrequency: money,
  dailyWithdrawal: money,
  monthlyWithdrawal: money,
  yearlyWithdrawal: money,
};

const spendControlSchema: Schema<SpendControl> = {
  spendControlAmount: objectOf(spendControlAmountSchema),
  spendControlCap: objectOf(spendControlCapSchema),
  atmControl: objectOf(atmControlSchema),
};

const shippingInformationSchema: Schema<ShippingInformation> = {
  bulkShippingID: nullable(nonEmptyString),
  sku: nullable(nonEmptyString),
};

const otpPhoneNumberSchema: Schema<OtpPhoneNumber> = {
  dialCode: positiveInteger,
  phoneNumber: matching(DIGITS_REGEX),
};

const cardMetaSchema: Schema<CardMeta> = {
  id: nonEmptyString,
  email: matching(EMAIL_REGEX),
  otpPhoneNumber: objectOf(otpPhoneNumberSchema),
};

export const cardSchema: Schema<Card> = {
  id: uuid,
  cardName: nonEmptyString,
  secondaryCardName: anyString,
  last4: matching(LAST4_REGEX),
  cardType: matching(LOWER_IDENT_REGEX),
  availableCredit: money,
  status: matching(UPPER_ENUM_REGEX),
  physicalCardStatus: matching(UPPER_ENUM_REGEX),
  shippingAddress: present,
  spendControl: objectOf(spendControlSchema),
  cardDesign: uuid,
  threeDSForwarding: boolean,
  shippingInformation: objectOf(shippingInformationSchema),
  bulkShippingID: nullable(nonEmptyString),
  meta: objectOf(cardMetaSchema),
};

const paginationMetaSchema: Schema<PaginationMeta> = {
  totalItems: nonNegativeInteger,
  itemCount: nonNegativeInteger,
  itemsPerPage: positiveInteger,
  totalPages: positiveInteger,
  currentPage: positiveInteger,
};

export const cardsResponseSchema: Schema<CardsResponse> = {
  items: arrayOf(objectOf(cardSchema)),
  meta: objectOf(paginationMetaSchema),
};

export const accountBalanceSchema: Schema<AccountBalanceResponse> = {
  availableBalance: nonNegativeNumber,
  availableToAllocate: nonNegativeNumber,
};

export const errorResponseSchema: Schema<ErrorResponse> = {
  statusCode: httpErrorStatus,
  error: nonEmptyString,
  message: nonEmptyString,
};

/** A stub mapping file as written by the WireMock recorder (or by hand for error cases). */
export const mappingSchema: Schema<WiremockMapping> = {
  id: uuid,
  priority: optional(positiveInteger),
  request: objectOf<WiremockMapping["request"]>({
    url: matching(URL_PATH_REGEX),
    method: matching(HTTP_METHOD_REGEX),
    headers: optional(recordOf(objectOf({ equalTo: nonEmptyString }))),
  }),
  response: objectOf({
    status: httpStatus,
    bodyFileName: matching(BODY_FILE_NAME_REGEX),
    headers: recordOf(nonEmptyString),
  }),
  uuid,
};

/**
 * `GET /__admin/mappings`. Each entry must contain the recorded stub; WireMock
 * owns the full shape of its admin API, so extra keys are tolerated.
 */
export const adminMappingsSchema: Schema<AdminMappingsResponse> = {
  mappings: arrayOf(partialOf(mappingSchema)),
  meta: objectOf({ total: nonNegativeInteger }),
};

// ---------------------------------------------------------------------------
// Payload assertions (schema + cross-field invariants)
// ---------------------------------------------------------------------------

/** Asserts every field of a `GET /cards` body plus its pagination invariants. */
export function expectCardsResponse(actual: CardsResponse, expected = actual): void {
  expectObject(actual, expected, cardsResponseSchema);
  expect(actual.meta.itemCount).toBe(actual.items.length);
  expect(actual.meta.totalItems).toBeGreaterThanOrEqual(actual.meta.itemCount);
  expect(actual.meta.currentPage).toBeLessThanOrEqual(actual.meta.totalPages);
}

/** Asserts every field of a `GET /account/balance` body plus its balance invariant. */
export function expectAccountBalanceResponse(
  actual: AccountBalanceResponse,
  expected = actual,
): void {
  expectObject(actual, expected, accountBalanceSchema);
  expect(actual.availableToAllocate).toBeLessThanOrEqual(actual.availableBalance);
}

/** Asserts every field of a 4xx/5xx error envelope and that it reports `status`. */
export function expectErrorResponse(actual: ErrorResponse, status: number, expected = actual): void {
  expectObject(actual, expected, errorResponseSchema);
  expect(actual.statusCode).toBe(status);
}

/** Asserts a recorded stub mapping file plus its `uuid === id` invariant. */
export function expectMapping(actual: WiremockMapping): void {
  expectShape(actual, mappingSchema);
  expect(actual.uuid).toBe(actual.id);
}

// ---------------------------------------------------------------------------
// HTTP assertions
// ---------------------------------------------------------------------------

/**
 * Response headers owned by the servlet container (Jetty) that it may
 * legitimately regenerate; they are not part of the stub contract.
 */
export const SERVER_CONTROLLED_HEADERS: ReadonlySet<string> = new Set(["date", "server"]);

/** Asserts the status and every stub-controlled header recorded in `mapping`. */
export function expectStubResponse(response: Response, mapping: WiremockMapping): void {
  expect(response.status).toBe(mapping.response.status);
  for (const [name, value] of Object.entries(mapping.response.headers)) {
    if (!SERVER_CONTROLLED_HEADERS.has(name.toLowerCase())) {
      expect(response.headers.get(name)).toBe(value);
    }
  }
}
