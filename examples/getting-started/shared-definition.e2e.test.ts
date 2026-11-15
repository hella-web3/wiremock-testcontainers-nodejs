/**
 * The same suite with the container defined once, in `payments-api.ts` – the shape that scales to
 * many suites sharing a mock.
 *
 * @see https://hella-web3.github.io/wiremock-testcontainers-nodejs/docs/getting-started/quick-start
 */
import type { StartedWiremockContainer } from "@hellaweb3/wiremock-testcontainers-nodejs";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { PaymentsClient } from "../app/payments-client";
// #region shared
import { paymentsApi } from "./payments-api";

let wiremock: StartedWiremockContainer;

beforeAll(async () => {
  wiremock = await paymentsApi().start();
  await wiremock.waitUntilReady();
}, 120_000);
// #endregion shared

afterEach(() => wiremock.reset());
afterAll(() => wiremock?.stop());

it("creates a payment", async () => {
  const receipt = await new PaymentsClient(wiremock.getUrl()).create({ amount: "9.99", currency: "USD" }, "key-1");

  expect(receipt).toEqual({ id: "0d1a73f7-3bd5-4f65-b1a9-2f1d55e7c0a4", status: "PENDING" });
});
