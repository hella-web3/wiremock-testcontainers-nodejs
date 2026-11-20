/**
 * Verifying what your code sent: named request criteria, a JSON-body reader and an assertion
 * helper that prints the journal when a count is off.
 *
 * @see https://hellalabs.dev/wiremock-testcontainers-nodejs/docs/guides/verifying-requests
 */
import type {
  RecordedRequest,
  StartedWiremockContainer,
  WiremockRequestCriteria,
} from "@hellaweb3/wiremock-testcontainers-nodejs";

// #region criteria
/** Criteria are plain data: name them once, reuse them in every assertion. */
export const LIST_PAYMENTS = { method: "GET", urlPath: "/payments" } satisfies WiremockRequestCriteria;

export const CREATE_PAYMENT = {
  method: "POST",
  url: "/payments",
  headers: {
    "Content-Type": { equalTo: "application/json" },
    "Idempotency-Key": { matches: "[0-9a-f-]{36}" },
  },
} satisfies WiremockRequestCriteria;
// #endregion criteria

// #region json-body
/** The parsed JSON body of a recorded request – WireMock records `""` for requests without one. */
export function jsonBody<T = unknown>(request: RecordedRequest): T {
  if (!request.body) throw new Error(`${request.method} ${request.url} has no body`);
  return JSON.parse(request.body) as T;
}
// #endregion json-body

// #region expect-requested
/** The journal methods an assertion needs – a fake suffices in unit tests. */
export type RequestJournal = Pick<StartedWiremockContainer, "countRequests" | "findRequests">;

/** Asserts that exactly `times` requests matched; lists every received request otherwise. */
export async function expectRequested(journal: RequestJournal, criteria: WiremockRequestCriteria, times = 1): Promise<void> {
  const count = await journal.countRequests(criteria);
  if (count === times) return;
  const received = await journal.findRequests({ method: "ANY", urlPattern: ".*" });
  const list = received.map(({ method, url }) => `${method} ${url}`).join(", ") || "none";
  throw new Error(`expected ${times} request(s) matching ${JSON.stringify(criteria)}, got ${count}; received: ${list}`);
}
// #endregion expect-requested
