/**
 * Every registration of `stubbedPaymentsApi()`, served by a real WireMock: directories, mapping
 * files from paths, URLs, modules and packages, inline stubs, and response bodies.
 *
 * @see https://hellalabs.dev/wiremock-testcontainers-nodejs/docs/guides/registering-stubs
 */
import { readFileSync } from "node:fs";
import type { StartedWiremockContainer } from "@hellaweb3/wiremock-testcontainers-nodejs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { stubbedPaymentsApi } from "./stubs";

describe("stubbedPaymentsApi() – every kind of registration, served", () => {
  let wiremock: StartedWiremockContainer;

  beforeAll(async () => {
    wiremock = await stubbedPaymentsApi().start();
    await wiremock.waitUntilReady();
  }, 120_000);

  afterAll(async () => {
    await wiremock?.stop();
  });

  const get = async (path: string) => {
    const response = await fetch(wiremock.getUrl(path));
    return { status: response.status, type: response.headers.get("Content-Type"), body: await response.text() };
  };

  it("withMappings(directory): the recorded stubs and their __files/ bodies", async () => {
    const { status, body } = await get("/payments");
    expect(status).toBe(200);
    expect(JSON.parse(body).meta.totalItems).toBe(2);
  });

  it.each([
    ["/health", "a relative path", { status: "UP" }],
    ["/accounts/acc-1", "{ module, file }", { id: "acc-1", owner: "Ada Lovelace", currency: "GBP" }],
    ["/exchange-rates?base=USD", "{ package, file }, body from the package too", { base: "USD", rates: { EUR: 0.92, GBP: 0.79 } }],
    ["/invoices/inv-001", "a file: URL, body renamed with { file, name }", { id: "inv-001", total: "42.00", currency: "GBP", paid: true }],
  ])("withMapping(name, source): GET %s – registered from %s", async (path, _source, json) => {
    const { status, body } = await get(path);
    expect(status).toBe(200);
    expect(JSON.parse(body)).toEqual(json);
  });

  // #region assert-bodies
  it("withFiles(): bodies are served byte for byte", async () => {
    const statement = await get("/statements/2026-10");
    expect(statement.type).toBe("text/csv");
    expect(statement.body).toBe(readFileSync("./stubs/fixtures/statement.csv", "utf8"));
  });
  // #endregion assert-bodies

  it("withMapping(name, { json }): inline objects and strings", async () => {
    expect(await get("/ping")).toMatchObject({ status: 200, body: "pong" });
    const maintenance = await fetch(wiremock.getUrl("/maintenance"));
    expect(maintenance.status).toBe(503);
    expect(maintenance.headers.get("Retry-After")).toBe("120");
  });

  it("withMapping(name, { json: { mappings } }): several stubs under a nested name", async () => {
    const refund = await fetch(wiremock.getUrl("/refunds"), { method: "POST" });
    expect(refund.status).toBe(202);
    expect(await refund.json()).toEqual({ id: "ref-1", status: "ACCEPTED" });
    expect(await get("/refunds/ref-1")).toMatchObject({ status: 200, body: '{"status":"REFUNDED"}' });
  });

  // #region list-stubs
  it("the admin API lists every registered stub", async () => {
    const { mappings } = (await (await fetch(wiremock.getMappingUrl())).json()) as { mappings: unknown[] };
    expect(mappings).toHaveLength(11); // 2 recorded + 1 + 1 + 2 + 1 + 1 + 1 + 2
  });
  // #endregion list-stubs
});
