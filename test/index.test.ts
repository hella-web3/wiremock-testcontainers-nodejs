import { readFileSync, rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type StartedWiremockContainer, WiremockContainer } from "../src";
import { CARDS_BODY, FILES_DIR, listMappingFiles, STANDALONE as S, SCRATCH, SCRATCH_DIR, writeScratchProject } from "./helpers/fixtures";

describe("WiremockContainer", () => {
  let container: StartedWiremockContainer;

  beforeAll(async () => {
    container = await new WiremockContainer()
      .withName("wiremock-testcontainer")
      .withMappings("./test/__mocks__/wiremock")
      .start();
  }, 60000);

  afterAll(async () => {
    if (container) await container.stop();
  });

  it("should start and be reachable", async () => {
    expect(container).toBeDefined();
    expect(container.rpcUrl).toBeDefined();
  });

  it("should have loaded mappings", async () => {
    const cardsResponse = await fetch(`${container.rpcUrl}/cards`);
    expect(cardsResponse.status).toBe(200);
    const cardsResponseBody = await cardsResponse.json();
    expect(cardsResponseBody).toBeDefined();

    const accountBalResponse = await fetch(`${container.rpcUrl}/account/balance`);
    expect(accountBalResponse.status).toBe(200);
    const accountBalResponseBody = await accountBalResponse.json();
    expect(accountBalResponseBody).toBeDefined();
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
  }, 60000);

  afterAll(async () => {
    await container?.stop();
    rmSync(SCRATCH_DIR, { recursive: true, force: true });
  });

  it("GET /__admin/mappings lists the 4 recorded stubs plus health, transactions, ping, greeting and farewell", async () => {
    const { meta } = await (await fetch(`${container.rpcUrl}/__admin/mappings`)).json();
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
    const response = await fetch(`${container.rpcUrl}${path}`);
    expect(response.status).toBe(status);
    const text = await response.text();
    expect(typeof body === "string" ? text : JSON.parse(text)).toEqual(body);
  });
});
