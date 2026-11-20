/**
 * Unit tests of the system under test, with `fetch` stubbed – fast, but they only prove what the
 * client *sends*. `verification/verification.e2e.test.ts` proves it against a real HTTP server.
 *
 * @see https://hellalabs.dev/docs/wiremock-testcontainers-nodejs/docs/guides/verifying-requests
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaymentsApiError, PaymentsClient } from "./payments-client";

const BASE_URL = "http://localhost:8080";

/** Stubs `fetch` with `response` and returns the mock, to inspect the request. */
const stubFetch = (response: Response) => {
  const mock = vi.fn<typeof fetch>(async () => response);
  vi.stubGlobal("fetch", mock);
  return mock;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PaymentsClient", () => {
  it("lists payments", async () => {
    const page = { items: [], meta: { totalItems: 0 } };
    const mock = stubFetch(Response.json(page));
    await expect(new PaymentsClient(BASE_URL).list()).resolves.toEqual(page);
    expect(mock).toHaveBeenCalledWith(`${BASE_URL}/payments`, expect.objectContaining({ method: "GET" }));
  });

  it("lists a given page, ignoring a trailing slash of the base URL", async () => {
    const mock = stubFetch(Response.json({ items: [], meta: { totalItems: 0 } }));
    await new PaymentsClient(`${BASE_URL}/`).list(2);
    expect(mock).toHaveBeenCalledWith(`${BASE_URL}/payments?page=2`, expect.objectContaining({ method: "GET" }));
  });

  it("gets one payment by its URL-encoded id", async () => {
    const payment = { id: "pay 1", amount: "1.00", currency: "EUR", status: "SETTLED" };
    const mock = stubFetch(Response.json(payment));
    await expect(new PaymentsClient(BASE_URL).get("pay 1")).resolves.toEqual(payment);
    expect(mock).toHaveBeenCalledWith(`${BASE_URL}/payments/pay%201`, expect.anything());
  });

  it("creates a payment: JSON body, idempotency key and API key", async () => {
    const mock = stubFetch(Response.json({ id: "p-1", status: "PENDING" }, { status: 201 }));
    const client = new PaymentsClient(BASE_URL, { apiKey: "secret" });
    await expect(client.create({ amount: "9.99", currency: "USD" }, "key-1")).resolves.toEqual({ id: "p-1", status: "PENDING" });
    expect(mock).toHaveBeenCalledWith(`${BASE_URL}/payments`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer secret",
        "Idempotency-Key": "key-1",
        "Content-Type": "application/json",
      },
      body: '{"amount":"9.99","currency":"USD"}',
    });
  });

  it("throws a PaymentsApiError with the status for non-2xx answers", async () => {
    stubFetch(new Response("no such payment", { status: 404 }));
    const error = await new PaymentsClient(BASE_URL).get("missing").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PaymentsApiError);
    expect(error).toMatchObject({ name: "PaymentsApiError", status: 404, message: "GET /payments/missing failed with 404: no such payment" });
  });
});
