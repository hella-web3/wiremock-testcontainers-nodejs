import type { WireMockExtension, WiremockExtensionJar } from "@hellaweb3/wiremock-testcontainers-nodejs";

/** Everything WireMock needs to load a Java extension. */
export interface JavaExtensionDefinition {
  /** WireMock's name for the extension – what stubs reference. */
  readonly name: string;
  /** Its fully qualified Java class name, passed to `--extensions`. */
  readonly className: string;
  /** The JAR containing the class. */
  readonly jar: WiremockExtensionJar;
}

/**
 * Base class for TypeScript extensions that wrap one Java class: a subclass passes its
 * {@link JavaExtensionDefinition} to `super()` and adds typed helpers for its stubs.
 * @example
 * ```typescript
 * export class MyTransformer extends JavaExtension {
 *   constructor() {
 *     super({ name: "my-transformer", className: "com.acme.MyTransformer", jar: "./acme.jar" });
 *   }
 * }
 * ```
 */
export abstract class JavaExtension implements WireMockExtension {
  readonly #definition: JavaExtensionDefinition;

  protected constructor(definition: JavaExtensionDefinition) {
    this.#definition = definition;
  }

  getName(): string {
    return this.#definition.name;
  }

  getClassNames(): string[] {
    return [this.#definition.className];
  }

  getJars(): WiremockExtensionJar[] {
    return [this.#definition.jar];
  }
}
