import type { WiremockExtensionJar } from "@hellaweb3/wiremock-testcontainers-nodejs";

/** The Java package of the example extensions' classes. */
export const JAVA_PACKAGE = "com.hellaweb3.wiremock.extensions";

/**
 * The JARs the example extensions ship in. `{ module: import.meta.url }` resolves them next to
 * this file, so tests work from any working directory – and from an npm package.
 */
export const JARS = {
  /** `UppercaseTransformer`, `BodyLengthMatcher`, `StubCountAdminApi` – loaded by class name. */
  examples: { module: import.meta.url, file: "../__mocks__/extensions/example-extensions.jar" },
  /** `PoweredByTransformer`, declared in `META-INF/services` – loaded by scanning. */
  poweredBy: { module: import.meta.url, file: "../__mocks__/extensions/powered-by-extension.jar" },
} as const satisfies Record<string, WiremockExtensionJar>;
