/**
 * Container configuration checked without Docker: `start()` validates the command line before
 * anything starts, so conflicting options fail in a unit test.
 *
 * @see https://hellalabs.dev/wiremock-testcontainers-nodejs/docs/guides/configuring-the-container
 */
import { WiremockContainer } from "@hellaweb3/wiremock-testcontainers-nodejs";
import { describe, expect, it } from "vitest";
import { configuredThroughEnvironment, configuredWiremock, GREETING_STUB, WIREMOCK_IMAGE } from "./container";

describe("configuring the container", () => {
  it("builds both configurations", () => {
    expect(configuredWiremock()).toBeInstanceOf(WiremockContainer);
    expect(configuredThroughEnvironment()).toBeInstanceOf(WiremockContainer);
  });

  it("pins a WireMock 3 image and a templated greeting", () => {
    expect(WIREMOCK_IMAGE).toMatch(/^wiremock\/wiremock:3\.\d+\.\d+$/u);
    expect(GREETING_STUB.response.body).toContain("{{request.query.name}}");
  });

  // #region conflicts
  it("an option set twice with different values fails start() – WireMock would crash", async () => {
    const journal = { getName: () => "journal", getOptions: () => ["--max-request-journal=5"] };
    const container = new WiremockContainer().withCommand(["--max-request-journal=1000"]).withExtension(journal);
    await expect(container.start()).rejects.toThrow(
      'option "--max-request-journal=5" conflicts with "--max-request-journal=1000" set by withCommand() or WIREMOCK_OPTIONS',
    );
  });

  it("--extensions belongs to withExtension(), not withCommand()", async () => {
    const container = new WiremockContainer()
      .withCommand(["--extensions", "com.example.Other"])
      .withExtension("com.github.tomakehurst.wiremock.extension.responsetemplating.ResponseTemplateTransformer");
    await expect(container.start()).rejects.toThrow('"--extensions" is already set by withCommand() or WIREMOCK_OPTIONS');
  });
  // #endregion conflicts
});
