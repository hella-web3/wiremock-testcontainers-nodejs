import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
// Imported through `npm link` – exactly how an end user consumes the published package.
import {
  type StartedWiremockContainer,
  WiremockContainer,
} from "@hellaweb3/wiremock-testcontainers-nodejs";

/**
 * End-to-end user flow: a consumer project mocks its "payments API" with one
 * WireMock Testcontainer per suite and uses the test-utility API for set-up,
 * teardown and verification – no string formatting, no admin-API plumbing and
 * no container restarts between tests.
 *
 * Needs a container runtime (Docker, Podman, …), or Java 11+ with `npm test --no-docker`.
 */
describe("payments service backed by a WireMock Testcontainer", () => {
  let wiremock: StartedWiremockContainer;

  beforeAll(async () => {
    wiremock = await new WiremockContainer()
      .withName("wiremock-examples-e2e")
      .withMappings("./__mocks__/wiremock") // recorded stubs: GET + POST /payments
      .withMapping("ping", {
        json: { request: { method: "GET", url: "/ping" }, response: { status: 200, body: "pong" } },
      })
      .start();
    await wiremock.waitUntilReady(); // guard against racing a still-booting instance
  }, 120_000);

  // The fast lifecycle hook: pristine stubs and an empty request journal for
  // every test, without paying for a container restart.
  afterEach(async () => {
    await wiremock.reset();
  });

  afterAll(async () => {
    await wiremock?.stop();
  });

  it("is started and healthy", async () => {
    expect(await wiremock.isRunning()).toBe(true);
  });

  it("builds endpoint URLs from relative paths", () => {
    expect(wiremock.getUrl("/payments")).toBe(`${wiremock.rpcUrl}/payments`);
    expect(wiremock.getUrl("payments?page=1")).toBe(`${wiremock.rpcUrl}/payments?page=1`);
    expect(wiremock.getAdminUrl()).toBe(`${wiremock.rpcUrl}/__admin`);
    expect(wiremock.getMappingUrl()).toBe(`${wiremock.rpcUrl}/__admin/mappings`);
  });

  it("serves the recorded payments stubs", async () => {
    const list = await fetch(wiremock.getUrl("/payments"));
    expect(list.status).toBe(200);
    const body = await list.json();
    expect(body.items).toHaveLength(2);
    expect(body.meta.totalItems).toBe(2);

    const creation = await fetch(wiremock.getUrl("/payments"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "9.99", currency: "USD" }),
    });
    expect(creation.status).toBe(201);
    expect((await creation.json()).status).toBe("PENDING");
  });

  it("verifies outgoing calls with countRequests() and findRequests()", async () => {
    await fetch(wiremock.getUrl("/payments"));
    await fetch(wiremock.getUrl("/payments"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "9.99", currency: "USD" }),
    });

    expect(await wiremock.countRequests({ method: "GET", url: "/payments" })).toBe(1);
    expect(await wiremock.countRequests({ method: "POST", urlPath: "/payments" })).toBe(1);
    expect(await wiremock.countRequests({ method: "DELETE", urlPathPattern: "/payments/.*" })).toBe(0);

    const [creation] = await wiremock.findRequests({ method: "POST", urlPath: "/payments" });
    expect(creation.url).toBe("/payments");
    expect(JSON.parse(creation.body ?? "")).toEqual({ amount: "9.99", currency: "USD" });
  });

  it("clears the request journal between steps without losing stubs", async () => {
    await fetch(wiremock.getUrl("/payments"));
    expect(await wiremock.countRequests({ method: "GET", url: "/payments" })).toBe(1);

    await wiremock.resetRequests(); // journal only – stub configuration untouched

    expect(await wiremock.countRequests({ method: "GET", url: "/payments" })).toBe(0);
    expect((await fetch(wiremock.getUrl("/payments"))).status).toBe(200);
  });

  it("reset() drops runtime stubs and restores the registered ones – no restart", async () => {
    const registration = await fetch(wiremock.getMappingUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request: { method: "GET", url: "/payments/feature-flag" },
        response: { status: 200, body: "on" },
      }),
    });
    expect(registration.status).toBe(201);
    expect((await fetch(wiremock.getUrl("/payments/feature-flag"))).status).toBe(200);

    await wiremock.reset();

    expect((await fetch(wiremock.getUrl("/payments/feature-flag"))).status).toBe(404);
    expect((await fetch(wiremock.getUrl("/ping"))).status).toBe(200); // registered stub restored
    expect(await wiremock.isRunning()).toBe(true); // same container throughout
  });
});
