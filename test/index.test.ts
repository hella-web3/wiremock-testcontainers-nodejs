import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type StartedWiremockContainer, WiremockContainer } from "../src";

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
