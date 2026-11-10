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

/**
 * A Testcontainer for Wiremock. Stubs are registered with {@link withMappings} (a directory),
 * {@link withMapping} (one named stub) and {@link withFiles} (response bodies), in any
 * combination. Registrations are validated immediately and may not overwrite one another.
 *
 * @example
 * ```typescript
 * const container = await new WiremockContainer().start();
 * ```
 */
export class WiremockContainer extends GenericContainer {
  /** Container path → origin of every registered file. */
  #origins = new Map<string, string>();
  /** Stub id → container path declaring it: WireMock refuses to start with duplicates. */
  #stubIds = new Map<string, string>();

  /**
   * Creates a new WiremockContainer.
   * @example
   * ```typescript
   * const container = await new WiremockContainer().start();
   * ```
   * @param image The docker image to use. Defaults to "wiremock/wiremock".
   */
  constructor(image: string = "wiremock/wiremock") {
    super(image);
    this.withExposedPorts(8080);
    this.withWaitStrategy(Wait.forListeningPorts());
  }

  /**
   * Adds mappings to the Wiremock container.
   * @example
   * ```typescript
   * const container = await new WiremockContainer()
   *   .withMappings("./test/__mocks__/wiremock")
   *   .start();
   * ```
   * @param directory The directory containing `mappings/` and, optionally, `__files/`.
   * @throws If `mappings/` is not a directory in `directory`, or a file would overwrite an earlier registration.
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
   * Registers one stub at `mappings/<name>.json`, validated and copied byte-for-byte.
   * @example
   * ```typescript
   * new WiremockContainer()
   *   .withMapping("cards", "./test/fixtures/cards.json")
   *   .withMapping("user", { package: "@acme/fixtures", file: "wiremock/user.json" })
   *   .withMapping("balance", { module: import.meta.url, file: "./balance.json" })
   *   .withMapping("ping", { json: { request: { url: "/ping" }, response: { status: 200 } } });
   * ```
   * @param name File name below `mappings/`, may contain `/`; `.json` is appended unless present.
   * @throws If the name or source is invalid, the source is not a WireMock mapping, or it would overwrite an earlier registration.
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
   * Registers response bodies at `__files/<name>` (default: the base name), copied as-is.
   * @example
   * ```typescript
   * new WiremockContainer().withFiles("./test/fixtures/body.json", { file: "./logo.png", name: "img/logo.png" });
   * ```
   * @throws If a source or name is invalid, or a file would overwrite an earlier registration; nothing is registered then.
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

  /**
   * Starts the container and returns a {@link StartedWiremockContainer}.
   * @returns A promise that resolves to the started container.
   */
  public override async start(): Promise<StartedWiremockContainer> {
    const startedContainer = await super.start();
    return new StartedWiremockContainer(
      startedContainer,
      `http://${startedContainer.getHost()}:${startedContainer.getMappedPort(8080)}`,
    );
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

/**
 * A started Wiremock container with helper methods for interacting with the node.
 */
export class StartedWiremockContainer extends AbstractStartedContainer {
  readonly #rpcUrl: string;

  /**
   * Creates a new StartedWiremockContainer.
   * @param startedTestContainer The underlying TestContainer.
   * @param url The URL of the started container.
   */
  constructor(startedTestContainer: StartedTestContainer, url: string) {
    super(startedTestContainer);
    this.#rpcUrl = url;
  }

  /**
   * Gets the URL of the Wiremock node.
   */
  get rpcUrl(): string {
    return this.#rpcUrl;
  }
}
