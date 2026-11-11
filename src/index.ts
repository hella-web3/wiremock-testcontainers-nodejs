import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, join, posix, resolve } from "node:path";
import {
  AbstractStartedContainer,
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from "testcontainers";
import {
  containerName,
  fail,
  inlineJson,
  isRecord,
  listFiles,
  resolveFile,
  stubIds,
  stubIdsOf,
  within,
  type WiremockMappingSource,
  type WiremockStaticFile,
} from "./sources";
import { getRuntime, type WiremockStartRequest } from "./runtime";

export type {
  WiremockFileSource,
  WiremockMappingSource,
  WiremockPath,
  WiremockStaticFile,
  WiremockStubMapping,
} from "./sources";

const MAPPINGS = "/home/wiremock/mappings";
const FILES = "/home/wiremock/__files";
const INLINE = "inline JSON";

/** A file a registration places in the container. */
interface Claim {
  readonly target: string;
  /** The absolute source path, or {@link INLINE}. */
  readonly origin: string;
  readonly ids?: readonly string[];
}

/** A WireMock Testcontainer. Registrations are validated at once and may not overwrite one another. */
export class WiremockContainer extends GenericContainer {
  /** Container path → origin of every registered file. */
  #origins = new Map<string, string>();
  /** Stub id → container path declaring it: WireMock refuses to start with duplicates. */
  #stubIds = new Map<string, string>();

  /** @param image Docker image, default `wiremock/wiremock`. */
  constructor(image: string = "wiremock/wiremock") {
    super(image);
    this.withExposedPorts(8080);
    this.withWaitStrategy(Wait.forListeningPorts());
  }

  /**
   * Copies `directory/mappings/` (required) and `directory/__files/` (optional) into the container.
   * @throws If `mappings/` is missing or a file would overwrite an earlier registration.
   */
  public withMappings(directory: string): this {
    within("WiremockContainer.withMappings", () => {
      const mappings = join(directory, "mappings");
      if (!existsSync(mappings)) fail(`"${mappings}" does not exist`);
      if (!statSync(mappings).isDirectory()) fail(`"${mappings}" is not a directory`);
      // `__files/` is optional: mappings may define their response bodies inline.
      const files = join(directory, "__files");
      const dirs = [{ source: mappings, target: MAPPINGS }, ...(existsSync(files) ? [{ source: files, target: FILES }] : [])];
      this.#claim(
        dirs.flatMap(({ source, target }) =>
          listFiles(source).map((name) => ({
            target: posix.join(target, name),
            origin: resolve(source, name),
            ids: target === MAPPINGS ? stubIdsOf(join(source, name)) : [],
          })),
        ),
      );
      this.withCopyDirectoriesToContainer(dirs);
    });
    return this;
  }

  /**
   * Registers one stub at `mappings/<name>.json` (`name` may contain `/`).
   * @example .withMapping("ping", { json: { request: { url: "/ping" }, response: { status: 200 } } })
   * @throws If the source is invalid, not a WireMock stub, or would overwrite an earlier registration.
   */
  public withMapping(name: string, source: WiremockMappingSource): this {
    within(`WiremockContainer.withMapping("${name}")`, () => {
      const file = containerName(name);
      const target = posix.join(MAPPINGS, file.endsWith(".json") ? file : `${file}.json`);
      const inline = isRecord(source) && "json" in source;
      const origin = inline ? INLINE : resolveFile(source);
      const content = inline ? inlineJson(source.json) : readFileSync(origin);
      const ids = within(origin, () => stubIds(content.toString()));
      this.withCopyContentToContainer(this.#claim([{ target, origin, ids }]).map(() => ({ content, target })));
    });
    return this;
  }

  /**
   * Registers response bodies at `__files/<name>` (default: the base name). All or nothing.
   * @throws If a source or name is invalid or a file would overwrite an earlier registration.
   */
  public withFiles(...files: WiremockStaticFile[]): this {
    within("WiremockContainer.withFiles", () => {
      const claims = files.map((file) => {
        const origin = resolveFile(file);
        const name = isRecord(file) && file.name !== undefined ? containerName(file.name) : basename(origin);
        return { target: posix.join(FILES, name), origin };
      });
      this.withCopyFilesToContainer(this.#claim(claims).map(({ origin, target }) => ({ source: origin, target })));
    });
    return this;
  }

  /** Starts WireMock – in Docker, or locally once `./no-docker` is installed. */
  public override async start(): Promise<StartedWiremockContainer> {
    const runtime = getRuntime();
    const startedContainer = runtime ? await runtime.start(this.#startRequest()) : await super.start();
    return new StartedWiremockContainer(
      startedContainer,
      `http://${startedContainer.getHost()}:${startedContainer.getMappedPort(8080)}`,
    );
  }

  /** This builder's configuration, as handed to an alternative runtime. */
  #startRequest(): WiremockStartRequest {
    return {
      image: this.imageName.string,
      name: this.createOpts.name,
      command: [...(this.createOpts.Cmd ?? [])],
      environment: { ...this.environment },
      directories: this.directoriesToCopy.map(({ source, target }) => ({ source, target })),
      files: this.filesToCopy.map(({ source, target }) => ({ source, target })),
      contents: this.contentsToCopy.map(({ content, target }) => ({ content, target })),
    };
  }

  /**
   * Records `claims` – all or nothing – unless one would overwrite a file from another origin or
   * reuse a stub id. Returns the claims not already registered from the same file.
   */
  #claim<T extends Claim>(claims: readonly T[]): T[] {
    const origins = new Map(this.#origins);
    const owners = new Map(this.#stubIds);
    const fresh = claims.filter(({ target, origin, ids = [] }) => {
      const existing = origins.get(target);
      if (existing === origin && origin !== INLINE) return false;
      if (existing) fail(`"${target}" is already registered from ${existing}; registering ${origin} would overwrite it`);
      for (const id of ids) {
        const owner = owners.get(id);
        if (owner) fail(`stub id "${id}" in ${origin} is already used by "${owner}"; WireMock refuses to start with duplicate stub ids`);
        owners.set(id, target);
      }
      origins.set(target, origin);
      return true;
    });
    [this.#origins, this.#stubIds] = [origins, owners];
    return fresh;
  }
}

/** WireMock [request-matching](https://wiremock.org/docs/request-matching/) criteria; unknown fields pass through. */
export interface WiremockRequestCriteria {
  /** E.g. `"GET"`; `"ANY"` matches every method. */
  readonly method?: string;
  /** Exact path and query string. */
  readonly url?: string;
  /** Exact path, any query string. */
  readonly urlPath?: string;
  /** Regex for the path. */
  readonly urlPathPattern?: string;
  /** Regex for path and query string. */
  readonly urlPattern?: string;
  /** E.g. `{ "Content-Type": { equalTo: "application/json" } }`. */
  readonly headers?: Readonly<Record<string, unknown>>;
  /** E.g. `{ page: { equalTo: "1" } }`. */
  readonly queryParameters?: Readonly<Record<string, unknown>>;
  /** E.g. `[{ equalToJson: { id: 1 } }]`. */
  readonly bodyPatterns?: readonly object[];
  readonly [field: string]: unknown;
}

/** A request from WireMock's journal; fields not modelled here are kept as-is. */
export interface RecordedRequest {
  readonly id?: string;
  /** Path and query string, e.g. `"/cards?page=1"`. */
  readonly url: string;
  readonly absoluteUrl?: string;
  readonly method: string;
  readonly headers?: Readonly<Record<string, unknown>>;
  readonly queryParams?: Readonly<Record<string, unknown>>;
  readonly body?: string;
  /** Epoch milliseconds. */
  readonly loggedDate?: number;
  readonly [field: string]: unknown;
}

/** Options for {@link StartedWiremockContainer.waitUntilReady}. */
export interface WaitUntilReadyOptions {
  /** Milliseconds before giving up. Default `30_000`. */
  readonly timeout?: number;
  /** Milliseconds between probes. Default `250`. */
  readonly interval?: number;
}

const ADMIN_PATH = "/__admin";

/** A started WireMock container with URL, health, reset and verification helpers. */
export class StartedWiremockContainer extends AbstractStartedContainer {
  readonly #rpcUrl: string;

  /** Created by {@link WiremockContainer.start}; `url` is WireMock's base URL. */
  constructor(startedTestContainer: StartedTestContainer, url: string) {
    super(startedTestContainer);
    this.#rpcUrl = url;
  }

  /** Base URL, e.g. `http://localhost:32768`. */
  get rpcUrl(): string {
    return this.#rpcUrl;
  }

  /** Absolute URL for `path`, e.g. `getUrl("cards?page=1")`; no argument → {@link rpcUrl}. */
  public getUrl(path = ""): string {
    if (path === "") return this.#rpcUrl;
    const suffix = path.startsWith("/") || path.startsWith("?") ? path : `/${path}`;
    return `${this.#rpcUrl}${suffix}`;
  }

  /** Admin API base URL: `<rpcUrl>/__admin`. */
  public getAdminUrl(): string {
    return `${this.#rpcUrl}${ADMIN_PATH}`;
  }

  /** Stub mappings endpoint: `<rpcUrl>/__admin/mappings`. */
  public getMappingUrl(): string {
    return `${this.getAdminUrl()}/mappings`;
  }

  /** Whether WireMock responds healthily. Never throws. */
  public async isRunning(): Promise<boolean> {
    try {
      const health = await fetch(`${this.getAdminUrl()}/health`);
      if (health.status !== 404) return health.ok;
      // WireMock < 3.1.0 has no /__admin/health – the mappings endpoint serves as the probe.
      return (await fetch(this.getMappingUrl())).ok;
    } catch {
      return false;
    }
  }

  /**
   * Polls {@link isRunning} until healthy.
   * @throws If not healthy within `options.timeout`.
   */
  public async waitUntilReady(options: WaitUntilReadyOptions = {}): Promise<void> {
    const { timeout = 30_000, interval = 250 } = options;
    const deadline = Date.now() + timeout;
    const poll = async (): Promise<void> => {
      if (await this.isRunning()) return;
      if (Date.now() >= deadline) {
        throw new Error(`WireMock at ${this.#rpcUrl} was not ready within ${timeout}ms`);
      }
      await new Promise((_resolve) => setTimeout(_resolve, interval));
      return poll();
    };
    await poll();
  }

  /** Restores registered stubs and scenarios and clears the journal – no restart. */
  public async reset(): Promise<void> {
    await this.#admin("POST", "/reset");
  }

  /** Clears the request journal; stubs are kept. */
  public async resetRequests(): Promise<void> {
    await this.#admin("DELETE", "/requests");
  }

  /** Number of journal entries matching `request` since the last reset. */
  public async countRequests(request: WiremockRequestCriteria): Promise<number> {
    const response = await this.#admin("POST", "/requests/count", request);
    const { count } = (await response.json()) as { count: number };
    return count;
  }

  /** Journal entries matching `request` since the last reset. */
  public async findRequests(request: WiremockRequestCriteria): Promise<RecordedRequest[]> {
    const response = await this.#admin("POST", "/requests/find", request);
    const { requests } = (await response.json()) as { requests?: RecordedRequest[] };
    return requests ?? [];
  }

  /** Calls the admin API and fails loudly – WireMock's terse admin errors get context. */
  async #admin(method: string, path: string, body?: unknown): Promise<Response> {
    const response = await fetch(`${this.getAdminUrl()}${path}`, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `WireMock admin request ${method} ${ADMIN_PATH}${path} failed with ${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}`,
      );
    }
    return response;
  }
}
