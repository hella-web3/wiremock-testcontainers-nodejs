/**
 * One container, many tests: `reset()` after each test restores the registered stubs, restarts
 * scenarios and empties the journal; `resetRequests()` empties the journal only.
 *
 * @see https://hellalabs.dev/docs/wiremock-testcontainers-nodejs/docs/guides/test-isolation
 */
import type { StartedWiremockContainer } from "@hellaweb3/wiremock-testcontainers-nodejs";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PaymentsApiError, PaymentsClient } from "../app/payments-client";
import { addStub, statefulPaymentsApi } from "./isolation";

describe("isolating tests that share one container", () => {
  let wiremock: StartedWiremockContainer;
  let client: PaymentsClient;

  beforeAll(async () => {
    wiremock = await statefulPaymentsApi().start();
    await wiremock.waitUntilReady();
    client = new PaymentsClient(wiremock.getUrl());
  }, 120_000);

  // #region reset
  afterEach(async () => {
    await wiremock.reset(); // registered stubs only, scenarios restarted, journal empty – no restart
  });
  // #endregion reset

  afterAll(async () => {
    await wiremock?.stop();
  });

  // #region scenario
  it("a scenario moves on with every request…", async () => {
    expect((await client.get("pay-1")).status).toBe("PENDING");
    expect((await client.get("pay-1")).status).toBe("SETTLED");
  });

  it("…and reset() restarts it for the next test", async () => {
    expect((await client.get("pay-1")).status).toBe("PENDING");
  });
  // #endregion scenario

  // #region reset-requests
  it("resetRequests() empties the journal but keeps the scenario's state", async () => {
    await client.get("pay-1");
    expect(await wiremock.countRequests({ method: "GET", url: "/payments/pay-1" })).toBe(1);

    await wiremock.resetRequests();

    expect(await wiremock.countRequests({ method: "GET", url: "/payments/pay-1" })).toBe(0);
    expect((await client.get("pay-1")).status).toBe("SETTLED"); // still in state "settled"
  });
  // #endregion reset-requests

  // #region runtime-stub
  it("a stub added at runtime serves until reset()", async () => {
    await addStub(wiremock, {
      request: { method: "GET", url: "/payments/pay-404" },
      response: { status: 404, body: "no such payment" },
    });
    await expect(client.get("pay-404")).rejects.toThrow(PaymentsApiError);

    await wiremock.reset();

    // Unmatched again – WireMock answers 404 "Request was not matched" – and the recorded stubs remain.
    await expect(client.get("pay-404")).rejects.toMatchObject({ status: 404, message: expect.stringContaining("Request was not matched") });
    expect((await client.list()).meta.totalItems).toBe(2);
  });
  // #endregion runtime-stub
});
