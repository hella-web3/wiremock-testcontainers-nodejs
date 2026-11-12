import type { WireMockExtension } from "@hellaweb3/wiremock-testcontainers-nodejs";

/** Options of {@link GlobalResponseTemplating}. */
export interface GlobalResponseTemplatingOptions {
  /** Most template fragments cached – WireMock's `--max-template-cache-entries`. Default: no limit. */
  readonly maxCacheEntries?: number;
}

/**
 * A configuration-only extension: no Java, just the WireMock options that switch its built-in
 * Handlebars templating on for every response. Register the class for the defaults, or an
 * instance to configure it.
 */
export class GlobalResponseTemplating implements WireMockExtension {
  /** WireMock's name for its templating transformer. */
  static readonly NAME = "response-template";
  readonly #options: GlobalResponseTemplatingOptions;

  /** @throws If `maxCacheEntries` is not a positive integer – WireMock would crash at start-up. */
  constructor(options: GlobalResponseTemplatingOptions = {}) {
    const { maxCacheEntries } = options;
    if (maxCacheEntries !== undefined && !(Number.isInteger(maxCacheEntries) && maxCacheEntries > 0)) {
      throw new RangeError(`maxCacheEntries must be a positive integer, got ${maxCacheEntries}`);
    }
    this.#options = { ...options };
  }

  getName(): string {
    return GlobalResponseTemplating.NAME;
  }

  getOptions(): string[] {
    const { maxCacheEntries } = this.#options;
    return [
      "--global-response-templating",
      ...(maxCacheEntries === undefined ? [] : [`--max-template-cache-entries=${maxCacheEntries}`]),
    ];
  }
}
