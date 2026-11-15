/**
 * The registration rules, checked without Docker: registrations are validated as they are made and
 * may never overwrite one another.
 *
 * @see https://hella-web3.github.io/wiremock-testcontainers-nodejs/docs/guides/registering-stubs
 */
import { WiremockContainer } from "@hellaweb3/wiremock-testcontainers-nodejs";
import { describe, expect, it } from "vitest";
import { HEALTH_STUB } from "./sources";
import { MAINTENANCE_STUB, PING_STUB, REFUND_STUBS, stubbedPaymentsApi } from "./stubs";

describe("registering stubs", () => {
  it("accepts the whole payments API definition", () => {
    expect(stubbedPaymentsApi()).toBeInstanceOf(WiremockContainer);
  });

  it("exports stubs that are plain, serialisable data", () => {
    expect(PING_STUB.response.body).toBe("pong");
    expect(JSON.parse(MAINTENANCE_STUB)).toMatchObject({ response: { status: 503 } });
    expect(REFUND_STUBS).toHaveProperty("json.mappings.length", 2);
  });

  // #region rules
  it("registering the same file under the same name again is a no-op", () => {
    expect(() => new WiremockContainer().withMapping("health", HEALTH_STUB).withMapping("health", HEALTH_STUB)).not.toThrow();
  });

  it("a name already taken by another source is rejected – nothing is silently overwritten", () => {
    const container = new WiremockContainer().withMapping("ping", { json: PING_STUB });
    expect(() => container.withMapping("ping", HEALTH_STUB)).toThrow(
      '"/home/wiremock/mappings/ping.json" is already registered from inline JSON',
    );
  });

  it("stub ids must be unique across registrations – WireMock refuses to start otherwise", () => {
    const stub = { id: "8f2b0c55-6a57-4d8e-9d4e-6c1f3e1f0a01", ...PING_STUB };
    const container = new WiremockContainer().withMapping("ping", { json: stub });
    expect(() => container.withMapping("ping-again", { json: stub })).toThrow(
      'stub id "8f2b0c55-6a57-4d8e-9d4e-6c1f3e1f0a01" in inline JSON is already used by "/home/wiremock/mappings/ping.json"',
    );
  });

  it("withFiles() is all or nothing: one missing file rejects the whole call", () => {
    const container = new WiremockContainer();
    expect(() => container.withFiles("./stubs/fixtures/statement.csv", "./stubs/fixtures/missing.csv")).toThrow("does not exist");
    expect(() => container.withFiles("./stubs/fixtures/statement.csv")).not.toThrow(); // nothing was registered
  });
  // #endregion rules
});
