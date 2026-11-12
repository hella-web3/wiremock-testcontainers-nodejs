import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
// Imported through `npm link` – exactly how an end user consumes the published package.
import { type StartedWiremockContainer, WiremockContainer } from "@hellaweb3/wiremock-testcontainers-nodejs";
import {
  BodyLengthMatcher,
  GlobalResponseTemplating,
  PoweredByTransformer,
  StubCountAdminApi,
  UppercaseTransformer,
} from "../extensions";

/**
 * The example extensions in a consumer project, each observed through a real request – the usage
 * half of `extensions/README.md`. Needs Docker, or Java 11+ with `npm test --no-docker`.
 */

/** The payments API mock: each stub is applied with an extension's typed helper. */
const PAYMENT_STUBS = [
  {
    request: { method: "GET", url: "/payments/status" },
    response: { status: 200, body: "all systems go", ...UppercaseTransformer.transform({ suffix: "!" }) },
  },
  {
    request: { method: "GET", url: "/payments/motto" },
    response: { status: 200, body: "pay on time", ...UppercaseTransformer.transform() },
  },
  {
    request: { method: "POST", url: "/payments/notes", ...BodyLengthMatcher.longerThan(20) },
    response: { status: 413, jsonBody: { error: "note too long" } },
  },
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
    wiremock = await new WiremockContainer()
      .withName("wiremock-examples-extensions")
      // Classes are instantiated for you; the shared JAR is copied once.
      .withExtensions([UppercaseTransformer, BodyLengthMatcher, StubCountAdminApi, PoweredByTransformer])
      // An instance carries configuration.
      .withExtension(new GlobalResponseTemplating({ maxCacheEntries: 100 }))
      .withMapping("payments-extended", { json: { mappings: PAYMENT_STUBS } })
      .start();
    await wiremock.waitUntilReady();
  }, 120_000);

  afterEach(async () => {
    await wiremock.reset();
  });

  afterAll(async () => {
    await wiremock?.stop();
  });

  const postNote = (text: string) => fetch(wiremock.getUrl("/payments/notes"), { method: "POST", body: text });

  it("UppercaseTransformer upper-cases bodies, with and without a suffix", async () => {
    const status = await fetch(wiremock.getUrl("/payments/status"));
    expect(status.headers.get(UppercaseTransformer.HEADER)).toBe(UppercaseTransformer.NAME);
    expect(await status.text()).toBe("ALL SYSTEMS GO!");
    expect(await (await fetch(wiremock.getUrl("/payments/motto"))).text()).toBe("PAY ON TIME");
  });

  it("BodyLengthMatcher routes bodies longer than maxLength to their own stub", async () => {
    expect((await postNote("thanks")).status).toBe(201);
    const rejected = await postNote("a note that is far too long for the payments API");
    expect(rejected.status).toBe(413);
    expect(await rejected.json()).toEqual({ error: "note too long" });
  });

  it("StubCountAdminApi adds an admin route, called through its typed client", async () => {
    expect(await StubCountAdminApi.count(wiremock)).toBe(PAYMENT_STUBS.length);
  });

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
