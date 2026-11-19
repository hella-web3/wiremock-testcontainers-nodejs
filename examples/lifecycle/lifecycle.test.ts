/**
 * Unit test of the lifecycle helpers, with a fake container: code that needs only a container's
 * URL should ask for `Pick<StartedWiremockContainer, "getUrl">`.
 *
 * @see https://hella-labs.github.io/wiremock-testcontainers-nodejs/docs/guides/container-lifecycle
 */
import { describe, expect, it } from "vitest";
import { paymentsEnvironment, READINESS } from "./lifecycle";

describe("lifecycle helpers", () => {
  // #region fake
  it("paymentsEnvironment() needs nothing but getUrl()", () => {
    const fake = { getUrl: (path = "") => `http://localhost:8080${path}` };
    expect(paymentsEnvironment(fake)).toEqual({
      PAYMENTS_API_URL: "http://localhost:8080",
      PAYMENTS_WEBHOOK_URL: "http://localhost:8080/webhooks/payments",
    });
  });
  // #endregion fake

  it("waits longer and polls less often than the defaults", () => {
    expect(READINESS).toEqual({ timeout: 60_000, interval: 500 });
  });
});
