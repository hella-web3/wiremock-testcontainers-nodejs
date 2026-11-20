/**
 * The started container: its URLs, readiness, and stopping it – explicitly or with `await using`.
 *
 * @see https://hellalabs.dev/wiremock-testcontainers-nodejs/docs/guides/container-lifecycle
 */
import type { StartedWiremockContainer, WaitUntilReadyOptions } from "@hellaweb3/wiremock-testcontainers-nodejs";

// #region readiness
/** Poll WireMock's health every 500 ms, for up to a minute – the defaults are 250 ms and 30 s. */
export const READINESS: WaitUntilReadyOptions = { timeout: 60_000, interval: 500 };
// #endregion readiness

// #region environment
/**
 * Points the application under test at WireMock – e.g. the environment of a server a test starts.
 * Only `getUrl()` is needed, so unit tests can pass a fake.
 */
export function paymentsEnvironment(wiremock: Pick<StartedWiremockContainer, "getUrl">): Record<string, string> {
  return {
    PAYMENTS_API_URL: wiremock.getUrl(),
    PAYMENTS_WEBHOOK_URL: wiremock.getUrl("/webhooks/payments"),
  };
}
// #endregion environment
