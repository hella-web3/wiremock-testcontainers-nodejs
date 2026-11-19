/**
 * Serving WireMock from a local JVM instead of Docker – local development only.
 *
 * @see https://hella-labs.github.io/wiremock-testcontainers-nodejs/docs/guides/running-without-docker
 */
import {
  installNoDockerRuntime,
  isNoDockerRequested,
  type NoDockerOptions,
} from "@hellaweb3/wiremock-testcontainers-nodejs/no-docker";

// #region options
/** Every option is optional; these suit a busy laptop. */
export const NO_DOCKER_OPTIONS: NoDockerOptions = {
  startupTimeout: 90_000, // default 60 s – a cold JVM can be slow
  // jar: "./wiremock-standalone-3.13.2.jar", // default: $WIREMOCK_JAR, else the `wiremock` package's
  // java: "/opt/jdk-21/bin/java",            // default: $WIREMOCK_JAVA, $JAVA_HOME/bin/java, else `java`
  // cacheDir: false,                         // default: a class-data cache in the OS temp dir
};
// #endregion options

// #region install-if-requested
/**
 * Installs the runtime only if `WIREMOCK_NO_DOCKER` asks for it – for test runners whose setup
 * files cannot be conditional. Returns the uninstaller, if installed.
 * @throws In CI/CD, or if no WireMock JAR is found.
 */
export function installNoDockerIfRequested(options: NoDockerOptions = NO_DOCKER_OPTIONS): (() => void) | undefined {
  return isNoDockerRequested(options.env) ? installNoDockerRuntime(options) : undefined;
}
// #endregion install-if-requested
