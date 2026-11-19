/**
 * Unit tests of the verification helpers with a fake journal – no container.
 *
 * @see https://hella-labs.github.io/wiremock-testcontainers-nodejs/docs/guides/verifying-requests
 */
import type { RecordedRequest } from "@hellaweb3/wiremock-testcontainers-nodejs";
import { describe, expect, it } from "vitest";
import { CREATE_PAYMENT, expectRequested, jsonBody, LIST_PAYMENTS, type RequestJournal } from "./verification";

const recorded = (request: Partial<RecordedRequest>): RecordedRequest => ({ method: "GET", url: "/payments", ...request });

// #region fake-journal
/** A journal holding `requests`, counting those with the criteria's method. */
const fakeJournal = (requests: RecordedRequest[]): RequestJournal => ({
  countRequests: async ({ method }) => requests.filter((request) => request.method === method).length,
  findRequests: async () => requests,
});
// #endregion fake-journal

describe("verification helpers", () => {
  it("names criteria once", () => {
    expect(LIST_PAYMENTS).toEqual({ method: "GET", urlPath: "/payments" });
    expect(CREATE_PAYMENT.headers["Idempotency-Key"]).toEqual({ matches: "[0-9a-f-]{36}" });
  });

  it("jsonBody() parses a recorded body", () => {
    expect(jsonBody(recorded({ method: "POST", body: '{"amount":"9.99"}' }))).toEqual({ amount: "9.99" });
  });

  it("jsonBody() names a request without a body", () => {
    expect(() => jsonBody(recorded({ body: "" }))).toThrow("GET /payments has no body");
  });

  it("expectRequested() passes on the expected count", async () => {
    await expect(expectRequested(fakeJournal([recorded({})]), LIST_PAYMENTS)).resolves.toBeUndefined();
    await expect(expectRequested(fakeJournal([]), LIST_PAYMENTS, 0)).resolves.toBeUndefined();
  });

  it("expectRequested() lists what was received instead", async () => {
    await expect(expectRequested(fakeJournal([recorded({ method: "DELETE", url: "/payments/1" })]), LIST_PAYMENTS)).rejects.toThrow(
      'expected 1 request(s) matching {"method":"GET","urlPath":"/payments"}, got 0; received: DELETE /payments/1',
    );
    await expect(expectRequested(fakeJournal([]), LIST_PAYMENTS)).rejects.toThrow("received: none");
  });
});
