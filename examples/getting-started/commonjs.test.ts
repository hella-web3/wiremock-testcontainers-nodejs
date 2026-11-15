/**
 * The package from CommonJS – Jest with ts-jest, ts-node, `.cjs` files: `require()` resolves the
 * CommonJS build, which exports the same API as the ES module build.
 *
 * @see https://hella-web3.github.io/wiremock-testcontainers-nodejs/docs/getting-started/installation
 */
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

describe("CommonJS", () => {
  it("require() loads the CommonJS build, with the same exports", async () => {
    // #region cjs
    const { WiremockContainer } = require("@hellaweb3/wiremock-testcontainers-nodejs");
    // #endregion cjs
    const esm = await import("@hellaweb3/wiremock-testcontainers-nodejs");

    expect(new WiremockContainer().withMapping("ping", { json: { request: { url: "/ping" }, response: { status: 200 } } })).toBeInstanceOf(WiremockContainer);
    expect(WiremockContainer).not.toBe(esm.WiremockContainer); // a separate build…
    expect(Object.keys(require("@hellaweb3/wiremock-testcontainers-nodejs")).toSorted()).toEqual(Object.keys(esm).toSorted()); // …of the same API
  });
});
