/**
 * Unit test of the container definition – no Docker: registrations throw as soon as they are made,
 * so a broken fixture path or a malformed stub fails in milliseconds.
 *
 * @see https://hella-labs.github.io/wiremock-testcontainers-nodejs/docs/getting-started/quick-start
 */
import { WiremockContainer } from "@hellaweb3/wiremock-testcontainers-nodejs";
import { describe, expect, it } from "vitest";
import { PAYMENTS_STUBS, paymentsApi } from "./payments-api";

describe("paymentsApi() – validated without starting anything", () => {
  // #region validate
  it("registers the recorded stubs", () => {
    expect(paymentsApi()).toBeInstanceOf(WiremockContainer);
  });

  it("fails fast on a fixture directory without mappings/", () => {
    expect(() => new WiremockContainer().withMappings("./__mocks__/missing")).toThrow(
      'WiremockContainer.withMappings: "__mocks__/missing/mappings" does not exist',
    );
  });
  // #endregion validate

  it("reads the stubs relative to the working directory – the examples project", () => {
    expect(PAYMENTS_STUBS).toBe("./__mocks__/wiremock");
  });
});
