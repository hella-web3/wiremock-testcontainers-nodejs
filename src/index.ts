import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  AbstractStartedContainer,
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from "testcontainers";

/**
 * A Testcontainer for Wiremock.
 *
 * @example
 * ```typescript
 * const container = await new WiremockContainer().start();
 * ```
 */
export class WiremockContainer extends GenericContainer {
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
   * @throws If `mappings/` does not exist in `directory`.
   */
  public withMappings(directory: string): this {
    const mappings = join(directory, "mappings");
    if (!existsSync(mappings)) {
      throw new Error(`WiremockContainer.withMappings: "${mappings}" does not exist`);
    }
    this.withCopyDirectoriesToContainer([{ source: mappings, target: "/home/wiremock/mappings" }]);

    // `__files/` is optional: mappings may define their response bodies inline.
    const files = join(directory, "__files");
    if (existsSync(files)) {
      this.withCopyDirectoriesToContainer([{ source: files, target: "/home/wiremock/__files" }]);
    }

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
