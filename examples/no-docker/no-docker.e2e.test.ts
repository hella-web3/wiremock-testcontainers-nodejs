/**
 * What differs without Docker – runs only with `--no-docker`, which serves this suite's WireMock
 * from a local JVM. Every other E2E suite runs unchanged in both modes.
 *
 * @see https://hellalabs.dev/wiremock-testcontainers-nodejs/docs/guides/running-without-docker
 */
import { text } from "node:stream/consumers";
import type { StartedWiremockContainer } from "@hellaweb3/wiremock-testcontainers-nodejs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { paymentsApi } from "../getting-started/payments-api";

describe("WireMock as a local JVM (--no-docker)", () => {
  let wiremock: StartedWiremockContainer;

  beforeAll(async () => {
    wiremock = await paymentsApi().start(); // same code as with Docker
    await wiremock.waitUntilReady();
  }, 120_000);

  afterAll(async () => {
    await wiremock?.stop();
  });

  // #region differences
  it("listens on 127.0.0.1 and serves the same stubs", async () => {
    expect(wiremock.getHost()).toBe("127.0.0.1");
    expect((await fetch(wiremock.getUrl("/payments"))).status).toBe(200);
  });

  it("logs() returns the JVM's output", async () => {
    expect(await text(await wiremock.logs())).toMatch(/port:\s+\d+/u);
  });

  it("container-only features throw", async () => {
    await expect(wiremock.exec(["ls"])).rejects.toThrow("exec() is not supported with --no-docker");
  });
  // #endregion differences
});
