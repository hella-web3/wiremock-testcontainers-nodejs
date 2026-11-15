/**
 * The example extensions in a consumer project, each observed through a real request. Needs
 * Docker, or Java 11+ with `npm test --no-docker`.
 *
 * @see https://hella-web3.github.io/wiremock-testcontainers-nodejs/docs/extensions/typescript-extensions
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
// Imported through `npm link` – exactly how an end user consumes the published package.
import { type StartedWiremockContainer, WiremockContainer } from "@hellaweb3/wiremock-testcontainers-nodejs";
import {
  BodyLengthMatcher,
  EXTENSION_CLASSES,
  GlobalResponseTemplating,
  PoweredByTransformer,
  StubCountAdminApi,
  UppercaseTransformer,
} from ".";

/** The payments API mock: each stub is applied with an extension's typed helper. */
const PAYMENT_STUBS = [
  // #region stub-helper
  {
    request: { method: "GET", url: "/payments/status" },
    response: { status: 200, body: "all systems go", ...UppercaseTransformer.transform({ suffix: "!" }) },
  },
  // #endregion stub-helper
  {
    request: { method: "GET", url: "/payments/motto" },
    response: { status: 200, body: "pay on time", ...UppercaseTransformer.transform() },
  },
  // #region matcher-helper
  {
    request: { method: "POST", url: "/payments/notes", ...BodyLengthMatcher.longerThan(20) },
    response: { status: 413, jsonBody: { error: "note too long" } },
  },
  // #endregion matcher-helper
  {
    priority: 10, // the fallback for notes the matcher lets through
    request: { method: "POST", url: "/payments/notes" },
    response: { status: 201 },
  },
  {
    request: { method: "GET", urlPathPattern: "/payments/pay-[0-9]+" },
    response: { status: 200, body: '{ "id": "{{request.pathSegments.[1]}}", "status": "SETTLED" }' },
  },
];

describe("payments service mock with TypeScript extensions", () => {
  let wiremock: StartedWiremockContainer;

  beforeAll(async () => {
    // #region register
    wiremock = await new WiremockContainer()
      // Classes are instantiated for you; the JAR they share is copied once.
      .withExtensions(EXTENSION_CLASSES) // [UppercaseTransformer, BodyLengthMatcher, StubCountAdminApi, PoweredByTransformer]
      // An instance carries configuration.
      .withExtension(new GlobalResponseTemplating({ maxCacheEntries: 100 }))
      .withMapping("payments-extended", { json: { mappings: PAYMENT_STUBS } })
      .start();
    // #endregion register
    await wiremock.waitUntilReady();
  }, 120_000);

  afterEach(async () => {
    await wiremock.reset();
  });

  afterAll(async () => {
    await wiremock?.stop();
  });

  const postNote = (text: string) => fetch(wiremock.getUrl("/payments/notes"), { method: "POST", body: text });

  // #region assert
  it("UppercaseTransformer upper-cases bodies, with and without a suffix", async () => {
    const status = await fetch(wiremock.getUrl("/payments/status"));
    expect(status.headers.get(UppercaseTransformer.HEADER)).toBe(UppercaseTransformer.NAME);
    expect(await status.text()).toBe("ALL SYSTEMS GO!");
    expect(await (await fetch(wiremock.getUrl("/payments/motto"))).text()).toBe("PAY ON TIME");
  });
  // #endregion assert

  it("BodyLengthMatcher routes bodies longer than maxLength to their own stub", async () => {
    expect((await postNote("thanks")).status).toBe(201);
    const rejected = await postNote("a note that is far too long for the payments API");
    expect(rejected.status).toBe(413);
    expect(await rejected.json()).toEqual({ error: "note too long" });
  });

  // #region admin-client
  it("StubCountAdminApi adds an admin route, called through its typed client", async () => {
    expect(await StubCountAdminApi.count(wiremock)).toBe(PAYMENT_STUBS.length);
  });
  // #endregion admin-client

  it("GlobalResponseTemplating templates every response", async () => {
    const payment = await fetch(wiremock.getUrl("/payments/pay-123"));
    expect(await payment.json()).toEqual({ id: "pay-123", status: "SETTLED" });
  });

  it("PoweredByTransformer, found by scanning its JAR, adds its header to every response", async () => {
    const responses = await Promise.all(["/payments/status", "/payments/pay-1"].map((path) => fetch(wiremock.getUrl(path))));
    expect(responses.map((response) => response.headers.get(PoweredByTransformer.HEADER))).toEqual([
      PoweredByTransformer.VALUE,
      PoweredByTransformer.VALUE,
    ]);
  });
});
