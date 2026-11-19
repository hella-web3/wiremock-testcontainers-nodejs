/**
 * Configuring the container: the image, WireMock's command-line options, and any Testcontainers
 * builder method – `WiremockContainer` extends `GenericContainer`.
 *
 * @see https://hella-labs.github.io/wiremock-testcontainers-nodejs/docs/guides/configuring-the-container
 */
import { WiremockContainer, type WiremockStubMapping } from "@hellaweb3/wiremock-testcontainers-nodejs";

// #region image
/** Pin the image – the default, `wiremock/wiremock`, floats with every WireMock release. */
export const WIREMOCK_IMAGE = "wiremock/wiremock:3.13.2";
// #endregion image

/** Greets by name: needs response templating, which is off unless a stub or option enables it. */
export const GREETING_STUB = {
  request: { method: "GET", urlPath: "/greeting" },
  response: { status: 200, body: "Hello, {{request.query.name}}!" },
} satisfies WiremockStubMapping;

/** WireMock options through `withCommand()`, JVM options and Testcontainers settings. */
export function configuredWiremock(): WiremockContainer {
  // #region with-command
  return new WiremockContainer(WIREMOCK_IMAGE)
    .withCommand(["--global-response-templating", "--max-request-journal=1000"]) // WireMock CLI options
    .withEnvironment({ JAVA_OPTS: "-Xmx256m" }) // options for WireMock's JVM
    .withLabels({ "com.example.suite": "payments" }) // any GenericContainer method…
    .withStartupTimeout(120_000) // …e.g. to wait longer for a slow machine
    .withMapping("greeting", { json: GREETING_STUB });
  // #endregion with-command
}

/** The same WireMock option, through the image's `WIREMOCK_OPTIONS` variable instead. */
export function configuredThroughEnvironment(): WiremockContainer {
  // #region wiremock-options
  return new WiremockContainer(WIREMOCK_IMAGE)
    .withEnvironment({ WIREMOCK_OPTIONS: "--global-response-templating" })
    .withMapping("greeting", { json: GREETING_STUB });
  // #endregion wiremock-options
}
