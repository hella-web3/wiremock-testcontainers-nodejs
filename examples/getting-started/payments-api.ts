/**
 * The payments API mock, defined once and shared by every suite that needs it. Registrations are
 * validated as they are made – a typo in a fixture path fails here, in a unit test, before any
 * container starts.
 *
 * @see https://hella-web3.github.io/wiremock-testcontainers-nodejs/docs/getting-started/quick-start
 */
// #region definition
import { WiremockContainer } from "@hellaweb3/wiremock-testcontainers-nodejs";

/** Stubs recorded from the payments API: `mappings/` plus the `__files/` they reference. */
export const PAYMENTS_STUBS = "./__mocks__/wiremock";

/** A WireMock container serving the payments API – call `.start()` on it. */
export function paymentsApi(): WiremockContainer {
  return new WiremockContainer().withMappings(PAYMENTS_STUBS);
}
// #endregion definition
