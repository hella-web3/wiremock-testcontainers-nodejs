/**
 * Registering stubs: a recorded directory, single mapping files, inline stubs and response bodies –
 * all in one container definition.
 *
 * @see https://hellalabs.dev/wiremock-testcontainers-nodejs/docs/guides/registering-stubs
 */
import {
  WiremockContainer,
  type WiremockMappingSource,
  type WiremockStubMapping,
} from "@hellaweb3/wiremock-testcontainers-nodejs";
import {
  ACCOUNT_STUB,
  EXCHANGE_RATE_STUB,
  EXCHANGE_RATES_BODY,
  HEALTH_STUB,
  INVOICE_BODY,
  STATEMENT_BODY,
  STATEMENT_STUBS,
} from "./sources";

// #region inline-stub
/** One stub, written in TypeScript: `satisfies` checks its shape and keeps its literal types. */
export const PING_STUB = {
  request: { method: "GET", url: "/ping" },
  response: { status: 200, body: "pong" },
} satisfies WiremockStubMapping;
// #endregion inline-stub

// #region inline-mappings
/** Several stubs in one registration – `{ mappings: [...] }`, like a WireMock mapping file. */
export const REFUND_STUBS: WiremockMappingSource = {
  json: {
    mappings: [
      {
        request: { method: "POST", url: "/refunds" },
        response: { status: 202, jsonBody: { id: "ref-1", status: "ACCEPTED" } },
      },
      {
        request: { method: "GET", urlPathPattern: "/refunds/ref-[0-9]+" },
        response: { status: 200, jsonBody: { status: "REFUNDED" } },
      },
    ],
  },
};
// #endregion inline-mappings

// #region inline-string
/** A stub as a JSON string – e.g. generated elsewhere – is copied verbatim. */
export const MAINTENANCE_STUB = JSON.stringify({
  request: { method: "GET", url: "/maintenance" },
  response: { status: 503, headers: { "Retry-After": "120" } },
});
// #endregion inline-string

/** The payments API with every kind of registration – each one is asserted in the E2E test. */
export function stubbedPaymentsApi(): WiremockContainer {
  // #region registrations
  return new WiremockContainer()
    .withMappings("./__mocks__/wiremock") // a directory: mappings/ and __files/
    .withMapping("health", HEALTH_STUB) // one mapping file → mappings/health.json
    .withMapping("accounts", ACCOUNT_STUB)
    .withMapping("statements", STATEMENT_STUBS) // a file may hold { "mappings": [...] }
    .withMapping("exchange-rates", EXCHANGE_RATE_STUB)
    .withMapping("ping", { json: PING_STUB }) // inline: an object…
    .withMapping("maintenance", { json: MAINTENANCE_STUB }) // …or a JSON string
    .withMapping("payments/refunds", REFUND_STUBS) // "/" nests: mappings/payments/refunds.json
    .withFiles(STATEMENT_BODY, INVOICE_BODY, EXCHANGE_RATES_BODY); // bodies → __files/
  // #endregion registrations
}
