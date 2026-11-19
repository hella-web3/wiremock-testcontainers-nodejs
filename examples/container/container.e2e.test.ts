/**
 * Both configurations against a real WireMock: the option switches templating on for every stub.
 *
 * @see https://hella-labs.github.io/wiremock-testcontainers-nodejs/docs/guides/configuring-the-container
 */
import type { StartedWiremockContainer } from "@hellaweb3/wiremock-testcontainers-nodejs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configuredThroughEnvironment, configuredWiremock } from "./container";

describe.each([
  ["withCommand()", configuredWiremock],
  ["WIREMOCK_OPTIONS", configuredThroughEnvironment],
])("options through %s", (_, configure) => {
  let wiremock: StartedWiremockContainer;

  beforeAll(async () => {
    wiremock = await configure().start();
    await wiremock.waitUntilReady();
  }, 120_000);

  afterAll(async () => {
    await wiremock?.stop();
  });

  // #region templating
  it("templates every response: --global-response-templating is on", async () => {
    const response = await fetch(wiremock.getUrl("/greeting?name=Ada"));
    expect(await response.text()).toBe("Hello, Ada!");
  });
  // #endregion templating
});
