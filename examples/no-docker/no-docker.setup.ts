/**
 * `npm test --no-docker`: serves every WiremockContainer from a local WireMock JVM. `vitest.config.ts`
 * loads this file only when `WIREMOCK_NO_DOCKER=1`; the runtime throws in CI/CD.
 *
 * @see https://hellalabs.dev/wiremock-testcontainers-nodejs/docs/guides/running-without-docker
 */
// #region setup
import { installNoDockerRuntime } from "@hellaweb3/wiremock-testcontainers-nodejs/no-docker";
import { NO_DOCKER_OPTIONS } from "./no-docker";

installNoDockerRuntime(NO_DOCKER_OPTIONS);
// #endregion setup
