/**
 * Unit tests of the isolation helpers: `addStub()` against a stubbed `fetch` and a fake container.
 *
 * @see https://hellalabs.dev/wiremock-testcontainers-nodejs/docs/guides/test-isolation
 */
import { WiremockContainer } from "@hellaweb3/wiremock-testcontainers-nodejs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addStub, SETTLEMENT_SCENARIO, statefulPaymentsApi } from "./isolation";

const wiremock = { getMappingUrl: () => "http://localhost:8080/__admin/mappings" };
const stub = { request: { url: "/flag" }, response: { status: 200 } };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isolation helpers", () => {
  it("statefulPaymentsApi() adds a two-state scenario to the payments API", () => {
    expect(statefulPaymentsApi()).toBeInstanceOf(WiremockContainer);
    expect(SETTLEMENT_SCENARIO.mappings.map(({ requiredScenarioState }) => requiredScenarioState)).toEqual(["Started", "settled"]);
  });

  it("addStub() POSTs the stub to the mappings endpoint", async () => {
    const mock = vi.fn<typeof fetch>(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", mock);
    await addStub(wiremock, stub);
    expect(mock).toHaveBeenCalledWith("http://localhost:8080/__admin/mappings", expect.objectContaining({ method: "POST", body: JSON.stringify(stub) }));
  });

  it("addStub() fails loudly when WireMock rejects the stub", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response("bad stub", { status: 422 })));
    await expect(addStub(wiremock, stub)).rejects.toThrow("WireMock rejected the stub with 422: bad stub");
  });
});
