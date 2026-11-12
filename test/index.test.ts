import { readFileSync, rmSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { type StartedWiremockContainer, WiremockContainer } from "../src";
import { CLASSES, EXAMPLE_JAR, EXTENSION_FIXTURE_DIR, GlobalResponseTemplating, POWERED_BY_JAR, UppercaseExtension } from "./helpers/extensions";
import { CARDS_BODY, FILES_DIR, listMappingFiles, STANDALONE as S, SCRATCH, SCRATCH_DIR, writeScratchProject } from "./helpers/fixtures";

/**
 * E2E suites against a real WireMock container (or a local JVM with `--no-docker`).
 * They double as living documentation of the test-utility API: one container
 * per suite, `waitUntilReady()` guards start-up, `resetRequests()` isolates
 * the request journal per test and `reset()` restores pristine stub state –
 * all without ever restarting the container.
 */
describe("WiremockContainer", () => {
  let container: StartedWiremockContainer;

  beforeAll(async () => {
    container = await new WiremockContainer()
      .withName("wiremock-testcontainer")
      .withMappings("./test/__mocks__/wiremock")
      .start();
    await container.waitUntilReady(); // never race a still-booting instance
  }, 60000);

  // Per-test isolation without restarting the container: empty journal, stubs untouched.
  afterEach(async () => {
    await container.resetRequests();
  });

  afterAll(async () => {
    if (container) await container.stop();
  });

  it("should start and be reachable", async () => {
    expect(container).toBeDefined();
    expect(container.rpcUrl).toBeDefined();
    expect(await container.isRunning()).toBe(true);
  });

  it("builds URLs from relative paths – no string formatting in tests", () => {
    expect(container.getUrl()).toBe(container.rpcUrl);
    expect(container.getUrl("/cards")).toBe(`${container.rpcUrl}/cards`);
    expect(container.getUrl("cards?page=1")).toBe(`${container.rpcUrl}/cards?page=1`);
    expect(container.getAdminUrl()).toBe(`${container.rpcUrl}/__admin`);
    expect(container.getMappingUrl()).toBe(`${container.rpcUrl}/__admin/mappings`);
  });

  it("should have loaded mappings", async () => {
    const cardsResponse = await fetch(container.getUrl("/cards"));
    expect(cardsResponse.status).toBe(200);
    const cardsResponseBody = await cardsResponse.json();
    expect(cardsResponseBody).toBeDefined();

    const accountBalResponse = await fetch(container.getUrl("/account/balance"));
    expect(accountBalResponse.status).toBe(200);
    const accountBalResponseBody = await accountBalResponse.json();
    expect(accountBalResponseBody).toBeDefined();
  });

  it("counts matching requests since the last reset", async () => {
    await fetch(container.getUrl("/cards"));
    await fetch(container.getUrl("/cards"));
    await fetch(container.getUrl("/account/balance"));

    expect(await container.countRequests({ method: "GET", url: "/cards" })).toBe(2);
    expect(await container.countRequests({ method: "GET", urlPath: "/account/balance" })).toBe(1);
    expect(await container.countRequests({ method: "DELETE", url: "/cards" })).toBe(0);
  });

  it("finds matching requests for fine-grained assertions", async () => {
    await fetch(container.getUrl("/account/balance"), { headers: { "X-Request-Id": "req-42" } });

    const requests = await container.findRequests({ method: "GET", urlPath: "/account/balance" });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("/account/balance");
    expect(requests[0].method).toBe("GET");
    // Criteria support the full WireMock matching DSL, e.g. header matchers.
    const withHeader = await container.findRequests({
      method: "GET",
      urlPath: "/account/balance",
      headers: { "X-Request-Id": { equalTo: "req-42" } },
    });
    expect(withHeader).toHaveLength(1);
    expect(await container.findRequests({ method: "GET", url: "/nowhere" })).toEqual([]);
  });

  it("resetRequests() clears the journal without losing stub configuration", async () => {
    await fetch(container.getUrl("/cards"));
    expect(await container.countRequests({ method: "GET", url: "/cards" })).toBe(1);

    await container.resetRequests();

    expect(await container.countRequests({ method: "GET", url: "/cards" })).toBe(0);
    const response = await fetch(container.getUrl("/cards")); // stubs survived the reset
    expect(response.status).toBe(200);
  });

  it("reset() removes runtime stubs, restores file-backed stubs and clears the journal – no restart", async () => {
    // Register a stub at runtime through the admin API (getMappingUrl()).
    const registration = await fetch(container.getMappingUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request: { method: "GET", url: "/runtime" }, response: { status: 200, body: "temporary" } }),
    });
    expect(registration.status).toBe(201);
    expect((await fetch(container.getUrl("/runtime"))).status).toBe(200);

    await container.reset();

    expect((await fetch(container.getUrl("/runtime"))).status).toBe(404); // runtime stub gone
    expect((await fetch(container.getUrl("/cards"))).status).toBe(200); // file-backed stub restored
    expect(await container.isRunning()).toBe(true); // same container, never restarted
  });
});

describe("E2E: one container fed by withMappings(dir), withMapping(path | module | package | inline) and withFiles()", () => {
  let container: StartedWiremockContainer;

  beforeAll(async () => {
    writeScratchProject();
    const builder = new WiremockContainer()
      .withMappings("./test/__mocks__/wiremock")
      .withMapping("health", S.health)
      .withMapping("billing/transactions", { module: import.meta.url, file: "./__mocks__/standalone/mapping-transactions.json" })
      .withMapping("ping", { json: { request: { method: "GET", url: "/ping" }, response: { status: 200, body: "pong" } } })
      .withFiles(S.greetingBody, { file: S.transactionsBody, name: "transactions/body-transactions.json" });
    vi.spyOn(process, "cwd").mockReturnValueOnce(SCRATCH_DIR); // resolve the package from the scratch project
    container = await builder.withMapping("greetings", { package: SCRATCH.packages.plain, file: "greetings.json" }).start();
    await container.waitUntilReady();
  }, 60000);

  afterEach(async () => {
    await container.reset(); // pristine stubs and an empty journal for the next test
  });

  afterAll(async () => {
    await container?.stop();
    rmSync(SCRATCH_DIR, { recursive: true, force: true });
  });

  it("GET /__admin/mappings lists the 4 recorded stubs plus health, transactions, ping, greeting and farewell", async () => {
    const { meta } = await (await fetch(container.getMappingUrl())).json();
    expect(meta.total).toBe(listMappingFiles().length + 5);
  });

  it.each([
    ["/cards", "withMappings(dir)", 200, readFileSync(`${FILES_DIR}/${CARDS_BODY}`, "utf8")],
    ["/health", "withMapping(path), inline jsonBody", 200, { status: "UP" }],
    ["/transactions", "withMapping({ module }), body from withFiles({ name })", 200, readFileSync(S.transactionsBody, "utf8")],
    ["/greeting", "withMapping({ package }), body from withFiles(path)", 200, readFileSync(S.greetingBody, "utf8")],
    ["/farewell", "withMapping({ package }), 2nd stub of { mappings }", 200, "Goodbye"],
    ["/ping", "withMapping({ json })", 200, "pong"],
  ])("GET %s (registered via %s) → %i with the expected body", async (path, _via, status, body) => {
    const response = await fetch(container.getUrl(path));
    expect(response.status).toBe(status);
    const text = await response.text();
    expect(typeof body === "string" ? text : JSON.parse(text)).toEqual(body);

    // Every stub call is verifiable through the journal helpers.
    expect(await container.countRequests({ method: "GET", url: path })).toBe(1);
    const [request] = await container.findRequests({ method: "GET", url: path });
    expect(request.url).toBe(path);
  });

  it("the reset() hook leaves every registration pristine between tests", async () => {
    expect(await container.countRequests({ method: "GET", urlPattern: "/.*" })).toBe(0); // journal emptied by afterEach
    expect((await fetch(container.getUrl("/ping"))).status).toBe(200); // registered stubs still served
    const { meta } = await (await fetch(container.getMappingUrl())).json();
    expect(meta.total).toBe(listMappingFiles().length + 5); // exactly the registered stubs, nothing leaked
  });
});

/** Stubs using the extensions: each is observable only if WireMock loaded its extension. */
const EXTENSION_STUBS = {
  mappings: [
    {
      request: { method: "GET", url: "/shout" },
      response: { status: 200, body: "hello, wiremock", transformers: ["uppercase"], transformerParameters: { suffix: "!" } },
    },
    {
      request: { method: "POST", url: "/upload", customMatcher: { name: "body-too-long", parameters: { maxLength: 16 } } },
      response: { status: 413, body: "too long" },
    },
    { priority: 10, request: { method: "POST", url: "/upload" }, response: { status: 201, body: "stored" } },
    { request: { method: "GET", urlPath: "/echo" }, response: { status: 200, body: "{{request.query.word}}" } },
  ],
};

describe("E2E: WireMock extensions from JARs, class names and TypeScript extensions", () => {
  let container: StartedWiremockContainer;

  beforeAll(async () => {
    container = await new WiremockContainer()
      .withExtensionJars([EXTENSION_FIXTURE_DIR]) // a directory: both JARs, incl. the scanned PoweredByTransformer
      .withExtension(UppercaseExtension) // a TypeScript extension: class name + its (same) JAR
      .withExtensions([CLASSES.stubCount, CLASSES.bodyLength, new GlobalResponseTemplating()])
      .withMapping("extensions", { json: EXTENSION_STUBS })
      .start();
    await container.waitUntilReady();
  }, 120_000);

  afterEach(async () => {
    await container.reset();
  });

  afterAll(async () => {
    await container?.stop();
  });

  it("response transformer (UppercaseTransformer): upper-cases the body, appends its parameter, adds a header", async () => {
    const response = await fetch(container.getUrl("/shout"));
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Transformed-By")).toBe("uppercase");
    expect(await response.text()).toBe("HELLO, WIREMOCK!");
  });

  it("admin API extension (StubCountAdminApi): serves GET /__admin/stub-count", async () => {
    const response = await fetch(`${container.getAdminUrl()}/stub-count`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: EXTENSION_STUBS.mappings.length });
  });

  it("custom request matcher (BodyLengthMatcher): routes bodies longer than maxLength to the 413 stub", async () => {
    const upload = (body: string) => fetch(container.getUrl("/upload"), { method: "POST", body });
    expect((await upload("short")).status).toBe(201);
    expect((await upload("a body that is far longer than sixteen characters")).status).toBe(413);
    expect(await container.countRequests({ method: "POST", url: "/upload" })).toBe(2);
  });

  it("extension scanning (PoweredByTransformer): loaded from META-INF/services without --extensions", async () => {
    const responses = await Promise.all(["/shout", "/echo?word=hi"].map((path) => fetch(container.getUrl(path))));
    expect(responses.map((response) => response.headers.get("X-Powered-By"))).toEqual(["wiremock-extensions", "wiremock-extensions"]);
  });

  it("configuration-only TypeScript extension (GlobalResponseTemplating): every response is templated", async () => {
    expect(await (await fetch(container.getUrl("/echo?word=templated"))).text()).toBe("templated");
  });
});

describe("E2E: extension options and start-up failures", () => {
  const ping = { json: { request: { method: "GET", url: "/ping" }, response: { status: 200, body: "pong" } } };

  it("scanning: false – a JAR's META-INF/services extensions are not loaded", async () => {
    const container = await new WiremockContainer()
      .withExtensionJar(POWERED_BY_JAR)
      .withExtensionOptions({ scanning: false })
      .withMapping("ping", ping)
      .start();
    try {
      await container.waitUntilReady();
      const response = await fetch(container.getUrl("/ping"));
      expect(await response.text()).toBe("pong");
      expect(response.headers.get("X-Powered-By")).toBeNull();
    } finally {
      await container.stop();
    }
  }, 120_000);

  it("a class WireMock cannot load fails start() with the extensions in use", async () => {
    const missing = "com.hellaweb3.wiremock.extensions.Missing";
    const start = new WiremockContainer()
      .withExtensionJar(EXAMPLE_JAR)
      .withExtension(missing)
      .withExtensionOptions({ verifyClassNames: false }) // skip the check that would catch it before start-up
      .withStartupTimeout(20_000) // Docker: the crashed container never binds its port
      .start();
    await expect(start).rejects.toThrow(`WireMock was started with extensions: ${missing}; JARs: example-extensions.jar.`);
  }, 120_000);
});
