/**
 * The quick start: one WireMock container per suite, `reset()` between tests, assertions through
 * WireMock's request journal. Needs Docker, or Java 11+ with `npm test --no-docker`.
 *
 * @see https://hella-web3.github.io/wiremock-testcontainers-nodejs/docs/getting-started/quick-start
 */
// #region quick-start
import { afterAll, afterEach, beforeAll, expect, it } from "vitest"; // or Jest
import { type StartedWiremockContainer, WiremockContainer } from "@hellaweb3/wiremock-testcontainers-nodejs";
import { PaymentsClient } from "../app/payments-client"; // the code under test

let wiremock: StartedWiremockContainer;

beforeAll(async () => {
  wiremock = await new WiremockContainer()
    .withMappings("./__mocks__/wiremock") // mappings/ + __files/
    .start();
  await wiremock.waitUntilReady();
}, 120_000); // the first image pull can be slow

afterEach(() => wiremock.reset()); // pristine stubs, empty journal – no restart
afterAll(() => wiremock?.stop());

it("lists the recorded payments", async () => {
  const page = await new PaymentsClient(wiremock.getUrl()).list();

  expect(page.meta.totalItems).toBe(2);
  expect(await wiremock.countRequests({ method: "GET", url: "/payments" })).toBe(1);
});
// #endregion quick-start

it("starts every test with an empty request journal", async () => {
  expect(await wiremock.countRequests({ method: "ANY", urlPattern: "/.*" })).toBe(0);
});
