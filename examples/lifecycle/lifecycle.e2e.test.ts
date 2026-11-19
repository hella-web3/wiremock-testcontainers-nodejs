/**
 * A started container's URLs and health, and both ways to stop it.
 *
 * @see https://hella-labs.github.io/wiremock-testcontainers-nodejs/docs/guides/container-lifecycle
 */
import type { StartedWiremockContainer } from "@hellaweb3/wiremock-testcontainers-nodejs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { paymentsApi } from "../getting-started/payments-api";
import { paymentsEnvironment, READINESS } from "./lifecycle";

describe("a started container", () => {
  let wiremock: StartedWiremockContainer;

  // #region start
  beforeAll(async () => {
    wiremock = await paymentsApi().start(); // resolves once the port listens…
    await wiremock.waitUntilReady(READINESS); // …and this once WireMock answers healthily
  }, 120_000);

  afterAll(async () => {
    await wiremock?.stop(); // `?.`: beforeAll may have failed
  });
  // #endregion start

  // #region urls
  it("builds URLs from paths – no string formatting in tests", () => {
    expect(wiremock.rpcUrl).toMatch(/^http:\/\/[^/]+:\d+$/u); // e.g. http://localhost:32768
    expect(wiremock.getUrl()).toBe(wiremock.rpcUrl);
    expect(wiremock.getUrl("/payments")).toBe(`${wiremock.rpcUrl}/payments`);
    expect(wiremock.getUrl("payments?page=2")).toBe(`${wiremock.rpcUrl}/payments?page=2`); // "/" added
    expect(wiremock.getAdminUrl()).toBe(`${wiremock.rpcUrl}/__admin`);
    expect(wiremock.getMappingUrl()).toBe(`${wiremock.rpcUrl}/__admin/mappings`);
  });
  // #endregion urls

  it("reports itself healthy", async () => {
    expect(await wiremock.isRunning()).toBe(true);
  });

  it("points the application under test at WireMock", async () => {
    const { PAYMENTS_API_URL } = paymentsEnvironment(wiremock);
    expect((await fetch(`${PAYMENTS_API_URL}/payments`)).status).toBe(200);
  });
});

// #region await-using
it("`await using` stops the container when the block ends", async () => {
  let stopped: StartedWiremockContainer;
  {
    await using wiremock = await paymentsApi().start();
    await wiremock.waitUntilReady();
    expect(await wiremock.isRunning()).toBe(true);
    stopped = wiremock;
  } // ← wiremock.stop() runs here, even if an assertion failed
  expect(await stopped.isRunning()).toBe(false); // never throws
}, 120_000);
// #endregion await-using
