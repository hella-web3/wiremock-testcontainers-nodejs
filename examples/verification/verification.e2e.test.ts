/**
 * Verifying the requests the payments client sends – through WireMock's request journal, so the
 * assertions cover what actually went over the wire.
 *
 * @see https://hellalabs.dev/wiremock-testcontainers-nodejs/docs/guides/verifying-requests
 */
import { randomUUID } from "node:crypto";
import type { StartedWiremockContainer } from "@hellaweb3/wiremock-testcontainers-nodejs";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { type NewPayment, PaymentsClient } from "../app/payments-client";
import { paymentsApi } from "../getting-started/payments-api";
import { CREATE_PAYMENT, expectRequested, jsonBody, LIST_PAYMENTS } from "./verification";

describe("verifying the requests the payments client sends", () => {
  let wiremock: StartedWiremockContainer;
  let client: PaymentsClient;

  beforeAll(async () => {
    wiremock = await paymentsApi().start();
    await wiremock.waitUntilReady();
    client = new PaymentsClient(wiremock.getUrl(), { apiKey: "test-key" });
  }, 120_000);

  afterEach(async () => {
    await wiremock.reset();
  });

  afterAll(async () => {
    await wiremock?.stop();
  });

  // #region count
  it("countRequests(): how many requests matched since the last reset", async () => {
    await client.list();
    await client.list(2);

    expect(await wiremock.countRequests({ method: "GET", url: "/payments" })).toBe(1); // exact path and query
    expect(await wiremock.countRequests({ method: "GET", urlPath: "/payments" })).toBe(2); // any query
    expect(await wiremock.countRequests({ method: "DELETE", urlPathPattern: "/payments/.*" })).toBe(0);
  });
  // #endregion count

  // #region find
  it("findRequests(): the recorded requests, for assertions on bodies and headers", async () => {
    const payment: NewPayment = { amount: "9.99", currency: "USD" };
    await client.create(payment, randomUUID());

    const [request] = await wiremock.findRequests(CREATE_PAYMENT);

    expect(jsonBody(request)).toEqual(payment);
    expect(request.headers).toMatchObject({ Authorization: "Bearer test-key" });
  });
  // #endregion find

  // #region matchers
  it("criteria use WireMock's request matching: query, header and body matchers", async () => {
    await client.list(2);
    await client.create({ amount: "120.00", currency: "EUR" }, randomUUID());

    expect(await wiremock.countRequests({ method: "GET", urlPath: "/payments", queryParameters: { page: { equalTo: "2" } } })).toBe(1);
    expect(await wiremock.countRequests({ method: "ANY", urlPattern: "/payments.*", headers: { Authorization: { matches: "Bearer .+" } } })).toBe(2);
    expect(
      await wiremock.countRequests({
        method: "POST",
        urlPath: "/payments",
        bodyPatterns: [{ matchesJsonPath: "$[?(@.currency == 'EUR')]" }, { equalToJson: { amount: "120.00" }, ignoreExtraElements: true }],
      }),
    ).toBe(1);
  });
  // #endregion matchers

  // #region recorded-request
  it("a RecordedRequest carries the URL, method, headers, query and body", async () => {
    await client.list(3);

    const [request] = await wiremock.findRequests(LIST_PAYMENTS);

    expect(request).toMatchObject({
      url: "/payments?page=3", // path and query
      absoluteUrl: wiremock.getUrl("/payments?page=3"),
      method: "GET",
      queryParams: { page: { key: "page", values: ["3"] } },
      body: "", // WireMock records "" for requests without a body
    });
    expect(request.headers?.Accept).toBe("application/json");
    expect(request.loggedDate).toBeLessThanOrEqual(Date.now()); // epoch milliseconds
  });
  // #endregion recorded-request

  // #region helper
  it("expectRequested(): one reusable assertion, with the journal in its message", async () => {
    await client.create({ amount: "1.00", currency: "USD" }, randomUUID());

    await expectRequested(wiremock, CREATE_PAYMENT);
    await expectRequested(wiremock, LIST_PAYMENTS, 0);
  });
  // #endregion helper
});
