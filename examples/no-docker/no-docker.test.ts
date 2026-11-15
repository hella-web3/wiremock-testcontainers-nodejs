/**
 * The no-Docker helpers, unit tested with explicit environments – nothing is started.
 *
 * @see https://hella-web3.github.io/wiremock-testcontainers-nodejs/docs/guides/running-without-docker
 */
import {
  detectCI,
  installNoDockerRuntime,
  isNoDockerRequested,
  NO_DOCKER_ENV,
} from "@hellaweb3/wiremock-testcontainers-nodejs/no-docker";
import { describe, expect, it } from "vitest";
import { installNoDockerIfRequested, NO_DOCKER_OPTIONS } from "./no-docker";

describe("running without Docker", () => {
  // #region detect
  it("detectCI() names the CI/CD variable that is set", () => {
    expect(detectCI({ GITHUB_ACTIONS: "true" })).toBe("GITHUB_ACTIONS");
    expect(detectCI({ CI: "false" })).toBeUndefined(); // "", "0" and "false" do not count
    expect(detectCI({})).toBeUndefined();
  });

  it("isNoDockerRequested() reads WIREMOCK_NO_DOCKER", () => {
    expect(NO_DOCKER_ENV).toBe("WIREMOCK_NO_DOCKER");
    expect(isNoDockerRequested({ [NO_DOCKER_ENV]: "1" })).toBe(true);
    expect(isNoDockerRequested({ [NO_DOCKER_ENV]: "true" })).toBe(true);
    expect(isNoDockerRequested({ [NO_DOCKER_ENV]: "yes" })).toBe(false);
  });
  // #endregion detect

  // #region refusals
  it("installNoDockerRuntime() refuses to run in CI/CD", () => {
    expect(() => installNoDockerRuntime({ env: { CI: "true" } })).toThrow("--no-docker must not be used in CI/CD (detected CI=true)");
  });

  it("installNoDockerRuntime() needs a WireMock JAR", () => {
    expect(() => installNoDockerRuntime({ env: {}, jar: "./missing.jar" })).toThrow('--no-docker: WireMock JAR "');
  });
  // #endregion refusals

  it("installNoDockerIfRequested() installs only when asked – and returns the uninstaller", () => {
    expect(installNoDockerIfRequested({ env: {} })).toBeUndefined();
    const uninstall = installNoDockerIfRequested({ env: { [NO_DOCKER_ENV]: "1" } }); // the `wiremock` package's JAR
    expect(uninstall).toBeTypeOf("function");
    uninstall?.();
  });

  it("waits up to 90 s for a cold JVM", () => {
    expect(NO_DOCKER_OPTIONS.startupTimeout).toBe(90_000);
  });
});
