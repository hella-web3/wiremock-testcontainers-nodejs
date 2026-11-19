/**
 * The registration errors you may meet, each triggered – all thrown synchronously, before any
 * container starts. Extension errors: `extensions/extensions.test.ts`.
 *
 * @see https://hella-labs.github.io/wiremock-testcontainers-nodejs/docs/reference/troubleshooting
 */
import { WiremockContainer } from "@hellaweb3/wiremock-testcontainers-nodejs";
import { describe, expect, it } from "vitest";

const container = () => new WiremockContainer();
const ping = { request: { url: "/ping" }, response: { status: 200 } };

describe("troubleshooting: registration errors", () => {
  // #region registration-errors
  it.each<[string, () => unknown, string]>([
    ["a directory without mappings/", () => container().withMappings("./stubs/fixtures"), 'mappings" does not exist'],
    ["a missing file", () => container().withMapping("health", "./stubs/health.json"), 'health.json" does not exist'],
    ["a JSON file that is not a stub", () => container().withMapping("x", "./__mocks__/wiremock/__files/body-payments.json"), "is not a WireMock stub mapping"],
    ["malformed JSON", () => container().withMapping("x", { json: "{ request: {} }" }), "invalid JSON"],
    ["an empty { mappings }", () => container().withMapping("x", { json: { mappings: [] } }), '"mappings" must be a non-empty array'],
    ["a name leaving mappings/", () => container().withMapping("../ping", { json: ping }), 'must be a relative path using "/" separators'],
    ["a package that is not installed", () => container().withMapping("x", { package: "@acme/stubs", file: "x.json" }), 'package "@acme/stubs" is not installed'],
    [
      "a path leaving its package",
      () => container().withMapping("x", { package: "@examples/payments-stubs", file: "../../package.json" }),
      'must point to a file inside package "@examples/payments-stubs"',
    ],
    ["a file registered twice", () => container().withMapping("ping", { json: ping }).withMapping("ping", { json: ping }), "is already registered from inline JSON"],
  ])("%s", (_, register, message) => {
    expect(register).toThrow(message);
  });
  // #endregion registration-errors

  it("every message names the method that failed", () => {
    expect(() => container().withMapping("health", "./stubs/health.json")).toThrow(/^WiremockContainer\.withMapping\("health"\): /u);
  });
});
