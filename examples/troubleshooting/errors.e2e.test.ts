/**
 * Failures that need a running WireMock – or a stopped one: what each error says.
 *
 * @see https://hellalabs.dev/docs/wiremock-testcontainers-nodejs/docs/reference/troubleshooting
 */
import { WiremockContainer } from "@hellaweb3/wiremock-testcontainers-nodejs";
import { describe, expect, it } from "vitest";
import { JARS } from "../extensions";
import { paymentsApi } from "../getting-started/payments-api";

describe("troubleshooting: runtime errors", () => {
  // #region admin-error
  it("a malformed matcher: WireMock's own explanation is in the error", async () => {
    await using wiremock = await paymentsApi().start();
    await wiremock.waitUntilReady();

    const count = wiremock.countRequests({ urlPath: "/payments", queryParameters: { page: { equalTo: 2 } } }); // not "2"

    await expect(count).rejects.toThrow(
      "WireMock admin request POST /__admin/requests/count failed with 422 Unprocessable Entity",
    );
    await expect(count).rejects.toThrow("equalTo operand must be a non-null string");
  });
  // #endregion admin-error

  // #region not-ready
  it("waitUntilReady() gives up after its timeout", async () => {
    const wiremock = await paymentsApi().start();
    await wiremock.stop();

    await expect(wiremock.waitUntilReady({ timeout: 1_000, interval: 100 })).rejects.toThrow(
      `WireMock at ${wiremock.rpcUrl} was not ready within 1000ms`,
    );
  });
  // #endregion not-ready

  // #region start-failure
  it("WireMock failing to start: the error names the extensions in use", async () => {
    const start = new WiremockContainer()
      .withExtensionJar(JARS.examples)
      .withExtension("com.hellaweb3.wiremock.extensions.Missing") // in no JAR: WireMock cannot load it
      .withExtensionOptions({ verifyClassNames: false }) // skips the check that would catch it before start-up
      .withStartupTimeout(20_000) // Docker: the crashed container never binds its port
      .start();

    await expect(start).rejects.toThrow(
      "WireMock was started with extensions: com.hellaweb3.wiremock.extensions.Missing; JARs: example-extensions.jar.",
    );
  });
  // #endregion start-failure
});
