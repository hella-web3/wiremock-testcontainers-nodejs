import { type ChildProcess, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { type AddressInfo, createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve as resolvePath } from "node:path";
import { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";
import type { StartedTestContainer, StoppedTestContainer } from "testcontainers";
import { getRuntime, setRuntime, type WiremockRuntime, type WiremockStartRequest } from "./runtime";

/**
 * `--no-docker` harness – **local development only**: serves every `WiremockContainer` from a
 * local WireMock standalone JVM instead of Docker. Refuses to run in CI/CD and warns on every
 * start. Needs Java 11+ and a WireMock JAR (e.g. the `wiremock` npm package).
 * @example
 * ```typescript
 * // Vitest/Jest setup file, registered only when `WIREMOCK_NO_DOCKER=1`
 * import { installNoDockerRuntime } from "@hellaweb3/wiremock-testcontainers-nodejs/no-docker";
 * installNoDockerRuntime();
 * ```
 * @module
 */

/** Set to `1` by the `--no-docker` flag. */
export const NO_DOCKER_ENV = "WIREMOCK_NO_DOCKER";

/** Set by CI/CD systems; any of them forbids `--no-docker`. */
const CI_VARIABLES = [
  "CI",
  "CONTINUOUS_INTEGRATION",
  "GITHUB_ACTIONS",
  "GITLAB_CI",
  "CIRCLECI",
  "BUILDKITE",
  "JENKINS_URL",
  "TF_BUILD",
  "TEAMCITY_VERSION",
  "BITBUCKET_BUILD_NUMBER",
  "CODEBUILD_BUILD_ID",
] as const;

type Environment = Readonly<Record<string, string | undefined>>;

/** Where WireMock's Docker image keeps `mappings/` and `__files/`; mirrored below a temp dir. */
const WIREMOCK_HOME = "/home/wiremock";
const WIREMOCK_PORT = 8080;
const HOST = "127.0.0.1";
/** Kept of the JVM's output for error messages and `logs()`. */
const MAX_OUTPUT = 64 * 1024;
/** Readiness probe interval while the JVM boots. */
const POLL_INTERVAL = 25;
/**
 * C1-only JIT: WireMock starts ~25 % faster and runs ample fast for a test double. Unknown flags
 * (the class-data ones on old JDKs) are ignored; `JAVA_OPTS` come later and win.
 */
const FAST_START = ["-XX:+IgnoreUnrecognizedVMOptions", "-XX:TieredStopAtLevel=1"];
/** HotSpot's exit code after a graceful SIGTERM shutdown (128 + 15). */
const GRACEFUL_EXIT = 143;
/** Abandoned class-data recordings (e.g. after Ctrl-C) older than this are removed. */
const STALE_RECORDING = 60 * 60 * 1000;

/** Options for {@link installNoDockerRuntime}. */
export interface NoDockerOptions {
  /** WireMock standalone JAR. Default: `$WIREMOCK_JAR`, else the `wiremock` npm package's. */
  readonly jar?: string;
  /** Java executable. Default: `$WIREMOCK_JAVA`, `$JAVA_HOME/bin/java`, else `java`. */
  readonly java?: string;
  /** Milliseconds to wait for WireMock to be healthy. Default `60_000`. */
  readonly startupTimeout?: number;
  /** Receives the per-start warning. Default: `process.emitWarning`. */
  readonly log?: (message: string) => void;
  /**
   * Cache for the class-data archive that halves JVM start-up after the first run; `false`
   * disables it. Default: `<os tmpdir>/wiremock-testcontainers`.
   */
  readonly cacheDir?: string | false;
  /** Source of the CI/CD check and the defaults above. Default: `process.env`. */
  readonly env?: Environment;
}

/** The CI/CD variable set in `env`, if any. */
export function detectCI(env: Environment = process.env): string | undefined {
  return CI_VARIABLES.find((name) => {
    const value = env[name]?.trim().toLowerCase();
    return value !== undefined && value !== "" && value !== "false" && value !== "0";
  });
}

/** Whether {@link NO_DOCKER_ENV} is `1` or `true`. */
export function isNoDockerRequested(env: Environment = process.env): boolean {
  const value = env[NO_DOCKER_ENV]?.trim().toLowerCase();
  return value === "1" || value === "true";
}

/**
 * Serves every `WiremockContainer` started from now on from a local WireMock JVM: its mappings,
 * files and command are materialised into a temp directory, WireMock listens on a free port of
 * `127.0.0.1`. Container-only features (`exec`, networks, …) throw.
 * @returns A function that uninstalls it.
 * @throws In CI/CD, or if no WireMock JAR is found.
 */
export function installNoDockerRuntime(options: NoDockerOptions = {}): () => void {
  const env = options.env ?? process.env;
  const ci = detectCI(env);
  if (ci) {
    throw new Error(
      `--no-docker must not be used in CI/CD (detected ${ci}=${env[ci]}): it does not run WireMock in a container. ` +
        "Run the E2E suite with Docker instead.",
    );
  }
  const runtime = new NoDockerRuntime({
    jar: resolveJar(options.jar ?? env.WIREMOCK_JAR),
    java: options.java ?? env.WIREMOCK_JAVA ?? (env.JAVA_HOME ? join(env.JAVA_HOME, "bin", "java") : "java"),
    startupTimeout: options.startupTimeout ?? 60_000,
    cacheDir: options.cacheDir ?? join(tmpdir(), "wiremock-testcontainers"),
    log: options.log ?? ((message) => process.emitWarning(message, { code: "WIREMOCK_NO_DOCKER" })),
  });
  setRuntime(runtime);
  return () => {
    if (getRuntime() === runtime) setRuntime(undefined);
  };
}

/** The explicit JAR, else the `wiremock` package's `wiremock-standalone-*.jar` (resolved from the working directory). */
function resolveJar(explicit: string | undefined): string {
  if (explicit) {
    const jar = resolvePath(explicit);
    if (!existsSync(jar)) throw new Error(`--no-docker: WireMock JAR "${jar}" does not exist`);
    return jar;
  }
  let build: string;
  try {
    build = join(dirname(createRequire(join(process.cwd(), "noop.js")).resolve("wiremock/package.json")), "build");
  } catch {
    throw new Error(
      '--no-docker: no WireMock standalone JAR found – install the "wiremock" npm package (e.g. `npm i -D wiremock`) ' +
        "or set WIREMOCK_JAR to a wiremock-standalone-*.jar",
    );
  }
  const name = existsSync(build) ? readdirSync(build).find((file) => /^wiremock-standalone-.+\.jar$/u.test(file)) : undefined;
  if (!name) throw new Error(`--no-docker: the "wiremock" npm package contains no wiremock-standalone-*.jar in "${build}"`);
  return join(build, name);
}

interface RuntimeConfig {
  readonly jar: string;
  readonly java: string;
  readonly startupTimeout: number;
  readonly cacheDir: string | false;
  readonly log: (message: string) => void;
}

/** A class-data archive: in use at `path`, or – if `recording` is set – being recorded there. */
interface ClassData {
  readonly path: string;
  readonly recording?: string;
}

/**
 * The AppCDS archive for this JAR and Java. If none exists yet, this JVM records one at its
 * (graceful) exit into a unique temp file that is renamed into place only when complete, so
 * parallel test workers never read a partial archive. Caching is best effort: any failure just
 * means a slower start.
 */
function classData(cacheDir: string | false, jar: string, java: string): ClassData | undefined {
  if (cacheDir === false) return undefined;
  try {
    mkdirSync(cacheDir, { recursive: true });
    const { size, mtimeMs } = statSync(jar);
    const key = createHash("sha256").update(`${jar}\0${size}\0${mtimeMs}\0${java}`).digest("hex").slice(0, 16);
    const path = join(cacheDir, `wiremock-${key}.jsa`);
    if (existsSync(path)) return { path };
    for (const file of readdirSync(cacheDir)) {
      const stale = join(cacheDir, file);
      if (file.endsWith(".tmp") && Date.now() - statSync(stale).mtimeMs > STALE_RECORDING) rmSync(stale, { force: true });
    }
    return { path, recording: `${path}.${randomUUID()}.tmp` };
  } catch {
    return undefined;
  }
}

class NoDockerRuntime implements WiremockRuntime {
  readonly #config: RuntimeConfig;

  constructor(config: RuntimeConfig) {
    this.#config = config;
  }

  async start(request: WiremockStartRequest): Promise<StartedTestContainer> {
    const root = mkdtempSync(join(tmpdir(), "wiremock-no-docker-"));
    try {
      await materialize(request, root);
      const home = join(root, WIREMOCK_HOME);
      for (const dir of ["mappings", "__files"]) mkdirSync(join(home, dir), { recursive: true });
      const container = new NoDockerContainer(request, this.#config, root, home, await freePort());
      await container.launch();
      this.#config.log(container.describe());
      return container;
    } catch (error) {
      rmSync(root, { recursive: true, force: true });
      throw error;
    }
  }
}

/** Writes everything the container would receive below `root`, keeping container paths. */
async function materialize(request: WiremockStartRequest, root: string): Promise<void> {
  const at = (target: string): string => {
    const path = join(root, target);
    mkdirSync(dirname(path), { recursive: true });
    return path;
  };
  for (const { source, target } of request.directories) cpSync(source, at(target), { recursive: true });
  for (const { source, target } of request.files) copyFileSync(source, at(target));
  const contents = await Promise.all(
    request.contents.map(async ({ content, target }) => ({ target, bytes: content instanceof Readable ? await buffer(content) : content })),
  );
  for (const { target, bytes } of contents) writeFileSync(at(target), bytes);
}

function freePort(): Promise<number> {
  return new Promise((_resolve, _reject) => {
    const server = createServer();
    server.once("error", _reject);
    server.listen(0, HOST, () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => _resolve(port));
    });
  });
}

/** Health probe: `/__admin/health`, or the mappings endpoint on WireMock < 3.1. Never throws. */
async function isHealthy(url: string): Promise<boolean> {
  try {
    const health = await fetch(`${url}/__admin/health`);
    if (health.status !== 404) return health.ok;
    return (await fetch(`${url}/__admin/mappings`)).ok;
  } catch {
    return false;
  }
}

const split = (value: string | undefined): string[] => value?.split(/\s+/u).filter(Boolean) ?? [];

/** JVMs still running when the test process exits are killed, like Testcontainers' Ryuk does for containers. */
const live = new Set<ChildProcess>();
let exitHookInstalled = false;
const killOnExit = (child: ChildProcess): void => {
  live.add(child);
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  process.once("exit", () => {
    for (const process of live) process.kill("SIGKILL");
  });
};

const unsupported = (method: string): Error =>
  new Error(`${method}() is not supported with --no-docker: WireMock runs as a local JVM process, not in a container`);

/** A WireMock standalone JVM posing as the started container. */
class NoDockerContainer implements StartedTestContainer {
  readonly #request: WiremockStartRequest;
  readonly #config: RuntimeConfig;
  readonly #root: string;
  readonly #home: string;
  readonly #port: number;
  readonly #id = `no-docker-${randomUUID()}`;
  #child: ChildProcess | undefined;
  #classData: ClassData | undefined;
  #spawnError: Error | undefined;
  #output = "";

  constructor(request: WiremockStartRequest, config: RuntimeConfig, root: string, home: string, port: number) {
    this.#request = request;
    this.#config = config;
    this.#root = root;
    this.#home = home;
    this.#port = port;
  }

  /** Starts the JVM and resolves once WireMock reports healthy; kills it on failure. */
  async launch(): Promise<void> {
    const { environment, command } = this.#request;
    const data = (this.#classData = classData(this.#config.cacheDir, this.#config.jar, this.#config.java));
    const args = [
      ...FAST_START,
      ...(data ? [data.recording ? `-XX:ArchiveClassesAtExit=${data.recording}` : `-XX:SharedArchiveFile=${data.path}`] : []),
      ...split(environment.JAVA_OPTS),
      "-jar",
      this.#config.jar,
      "--port",
      String(this.#port),
      "--bind-address",
      HOST,
      "--root-dir",
      this.#home,
      ...command,
      ...split(environment.WIREMOCK_OPTIONS),
    ];
    this.#output = "";
    this.#spawnError = undefined;
    const child = spawn(this.#config.java, args, { env: { ...process.env, ...environment }, stdio: ["ignore", "pipe", "pipe"] });
    this.#child = child;
    child.once("error", (error) => {
      this.#spawnError = error;
    });
    const record = (chunk: Buffer): void => {
      this.#output = (this.#output + chunk.toString()).slice(-MAX_OUTPUT);
    };
    child.stdout?.on("data", record);
    child.stderr?.on("data", record);
    killOnExit(child);
    try {
      await this.#waitUntilHealthy(child);
    } catch (error) {
      await this.#terminate();
      throw error;
    }
    // The JVM ignores a stale archive (new JDK, changed JAR) with a warning: drop it, so the next start records a fresh one.
    if (data && !data.recording && /\[warning\]\[cds/u.test(this.#output)) rmSync(data.path, { force: true });
  }

  async #waitUntilHealthy(child: ChildProcess): Promise<void> {
    const deadline = Date.now() + this.#config.startupTimeout;
    const output = (): string => (this.#output.trim() ? `\n--- WireMock output ---\n${this.#output.trim()}` : "");
    const poll = async (): Promise<void> => {
      if (this.#spawnError) {
        const missing = (this.#spawnError as NodeJS.ErrnoException).code === "ENOENT";
        throw new Error(
          missing
            ? `--no-docker: Java executable "${this.#config.java}" not found – WireMock's standalone JAR needs a Java 11+ runtime; install one or set WIREMOCK_JAVA / JAVA_HOME`
            : `--no-docker: could not start "${this.#config.java}": ${this.#spawnError.message}`,
          { cause: this.#spawnError },
        );
      }
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`--no-docker: WireMock exited during start-up (${child.signalCode ?? `exit code ${child.exitCode}`})${output()}`);
      }
      if (await isHealthy(this.#url)) return;
      if (Date.now() >= deadline) {
        throw new Error(`--no-docker: WireMock was not healthy within ${this.#config.startupTimeout}ms${output()}`);
      }
      await new Promise((_resolve) => setTimeout(_resolve, POLL_INTERVAL));
      return poll();
    };
    await poll();
  }

  /**
   * Stops the JVM. A throwaway test double has no state worth a graceful shutdown, so it is killed
   * at once – unless it records the class-data archive, which it writes on a graceful exit
   * (SIGTERM; SIGKILL after 10 s). Only a complete recording is published.
   */
  async #terminate(): Promise<void> {
    const child = this.#child;
    const recording = this.#classData?.recording;
    live.delete(child as ChildProcess);
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill(recording ? "SIGTERM" : "SIGKILL");
      const timer = setTimeout(() => child.kill("SIGKILL"), 10_000);
      await exited;
      clearTimeout(timer);
    }
    if (!recording) return;
    try {
      // Publish only what a graceful exit wrote in full.
      if (child?.exitCode === GRACEFUL_EXIT && existsSync(recording)) renameSync(recording, (this.#classData as ClassData).path);
    } catch {
      // Another worker published one first (Windows), or the cache vanished: the next start retries.
    }
    rmSync(recording, { force: true });
    this.#classData = undefined;
  }

  get #url(): string {
    return `http://${HOST}:${this.#port}`;
  }

  /** The warning printed for every start. */
  describe(): string {
    const version = /wiremock-standalone-(.+)\.jar$/u.exec(this.#config.jar)?.[1] ?? "unknown";
    // Only pinned tags (`3.13.0`, `3.13.0-alpine`) name a version; `latest`, `3x`, … float.
    const { image } = this.#request;
    const tag = image.slice(image.lastIndexOf(":") + 1);
    const pinned = /^(\d+\.\d+\.\d+)/u.exec(tag)?.[1];
    const mismatch = pinned && pinned !== version ? ` The image tag "${tag}" differs from the JAR version ${version}.` : "";
    return (
      `--no-docker: "${this.#request.image}" is NOT running in a container – WireMock ${version} standalone ` +
      `(local JVM, pid ${this.#child?.pid}) serves ${this.#url} instead.${mismatch} ` +
      "Local development only; never use --no-docker in CI/CD."
    );
  }

  async stop(): Promise<StoppedTestContainer> {
    await this.#terminate();
    rmSync(this.#root, { recursive: true, force: true });
    const id = this.#id;
    return {
      getId: () => id,
      copyArchiveFromContainer: async () => Promise.reject(unsupported("copyArchiveFromContainer")),
    };
  }

  /** Restarts the JVM with the same files and port – WireMock's in-memory state is lost, as with a container restart. */
  async restart(): Promise<void> {
    await this.#terminate();
    await this.launch();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.stop();
  }

  getHost(): string {
    return HOST;
  }

  getHostname(): string {
    return this.getName();
  }

  getFirstMappedPort(): number {
    return this.#port;
  }

  getMappedPort(port: number | `${number}/${"tcp" | "udp"}`, protocol = "tcp"): number {
    const key = typeof port === "number" ? `${port}/${protocol}` : port;
    if (key !== `${WIREMOCK_PORT}/tcp`) throw new Error(`No port mapping found for "${key}"`);
    return this.#port;
  }

  getName(): string {
    return this.#request.name ?? `wiremock-no-docker-${this.#port}`;
  }

  getLabels(): Record<string, string> {
    return {};
  }

  getId(): string {
    return this.#id;
  }

  getNetworkNames(): string[] {
    return [];
  }

  async logs(): Promise<Readable> {
    return Readable.from([this.#output]);
  }

  getNetworkId(): string {
    throw unsupported("getNetworkId");
  }

  getIpAddress(): string {
    throw unsupported("getIpAddress");
  }

  async commit(): Promise<string> {
    throw unsupported("commit");
  }

  async exec(): Promise<never> {
    throw unsupported("exec");
  }

  async copyArchiveFromContainer(): Promise<NodeJS.ReadableStream> {
    throw unsupported("copyArchiveFromContainer");
  }

  async copyArchiveToContainer(): Promise<void> {
    throw unsupported("copyArchiveToContainer");
  }

  async copyDirectoriesToContainer(): Promise<void> {
    throw unsupported("copyDirectoriesToContainer");
  }

  async copyFilesToContainer(): Promise<void> {
    throw unsupported("copyFilesToContainer");
  }

  async copyContentToContainer(): Promise<void> {
    throw unsupported("copyContentToContainer");
  }
}
