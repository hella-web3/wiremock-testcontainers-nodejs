/**
 * The package as an ES module – the build `import` resolves to.
 *
 * @see https://hellalabs.dev/docs/wiremock-testcontainers-nodejs/docs/getting-started/installation
 */
import { describe, expect, it } from "vitest";
// #region esm
import { WiremockContainer } from "@hellaweb3/wiremock-testcontainers-nodejs";
// #endregion esm

describe("ES modules", () => {
  it("import loads the ES module build", () => {
    expect(new WiremockContainer().withMapping("ping", { json: { request: { url: "/ping" }, response: { status: 200 } } })).toBeInstanceOf(WiremockContainer);
  });
});
