import type { Readable } from "node:stream";
import type { StartedTestContainer } from "testcontainers";

/** A file or directory `WiremockContainer` copies into the container. */
interface WiremockCopy {
  readonly source: string;
  /** Absolute path inside the container, e.g. `/home/wiremock/mappings/x.json`. */
  readonly target: string;
}

/** Literal content `WiremockContainer` writes into the container. */
interface WiremockContentCopy {
  readonly content: string | Buffer | Readable;
  readonly target: string;
}

/** The fully configured container a {@link WiremockRuntime} is asked to start. */
export interface WiremockStartRequest {
  /** Docker image reference, e.g. `wiremock/wiremock:latest`. */
  readonly image: string;
  /** Name set with `withName()`, if any. */
  readonly name?: string;
  /** Arguments set with `withCommand()` – WireMock CLI flags. */
  readonly command: readonly string[];
  /** Variables set with `withEnvironment()`. */
  readonly environment: Readonly<Record<string, string>>;
  readonly directories: readonly WiremockCopy[];
  readonly files: readonly WiremockCopy[];
  readonly contents: readonly WiremockContentCopy[];
}

/**
 * Starts WireMock somewhere other than a Docker container – e.g. the `--no-docker`
 * harness in `./no-docker`. Must return a container whose `getMappedPort(8080)` is
 * the port WireMock listens on at `getHost()`.
 */
export interface WiremockRuntime {
  start(request: WiremockStartRequest): Promise<StartedTestContainer>;
}

/**
 * A global registry key rather than a module-level variable: the package ships ESM and
 * CJS builds, and a runtime registered through one must be seen by containers of the other.
 */
const RUNTIME_KEY = Symbol.for("@hellaweb3/wiremock-testcontainers-nodejs/runtime");
const registry = globalThis as { [RUNTIME_KEY]?: WiremockRuntime };

/** The runtime `WiremockContainer.start()` uses instead of Docker, if one is registered. */
export const getRuntime = (): WiremockRuntime | undefined => registry[RUNTIME_KEY];

/** Registers `runtime` (or clears it with `undefined`) for every `WiremockContainer`. */
export const setRuntime = (runtime: WiremockRuntime | undefined): void => {
  if (runtime) registry[RUNTIME_KEY] = runtime;
  else delete registry[RUNTIME_KEY];
};
