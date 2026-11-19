/**
 * Test isolation without restarts: stateful scenarios and stubs added at runtime are what
 * `reset()` rolls back – `resetRequests()` only empties the request journal.
 *
 * @see https://hella-labs.github.io/wiremock-testcontainers-nodejs/docs/guides/test-isolation
 */
import type {
  StartedWiremockContainer,
  WiremockContainer,
  WiremockStubMapping,
} from "@hellaweb3/wiremock-testcontainers-nodejs";
import { paymentsApi } from "../getting-started/payments-api";

// #region scenario
const payment = (status: string) => ({ id: "pay-1", amount: "42.00", currency: "USD", status });

/** A stateful stub: the first GET answers PENDING, every later one SETTLED. */
export const SETTLEMENT_SCENARIO = {
  mappings: [
    {
      scenarioName: "settlement",
      requiredScenarioState: "Started",
      newScenarioState: "settled",
      request: { method: "GET", url: "/payments/pay-1" },
      response: { status: 200, jsonBody: payment("PENDING") },
    },
    {
      scenarioName: "settlement",
      requiredScenarioState: "settled",
      request: { method: "GET", url: "/payments/pay-1" },
      response: { status: 200, jsonBody: payment("SETTLED") },
    },
  ],
} satisfies { mappings: WiremockStubMapping[] };
// #endregion scenario

/** The payments API plus the settlement scenario. */
export function statefulPaymentsApi(): WiremockContainer {
  return paymentsApi().withMapping("settlement", { json: SETTLEMENT_SCENARIO });
}

// #region add-stub
/** Adds a stub to a running WireMock through its admin API; it lasts until the next `reset()`. */
export async function addStub(
  wiremock: Pick<StartedWiremockContainer, "getMappingUrl">,
  stub: WiremockStubMapping,
): Promise<void> {
  const response = await fetch(wiremock.getMappingUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(stub),
  });
  if (response.status !== 201) throw new Error(`WireMock rejected the stub with ${response.status}: ${await response.text()}`);
}
// #endregion add-stub
