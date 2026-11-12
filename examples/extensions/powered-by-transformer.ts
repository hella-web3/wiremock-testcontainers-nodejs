import type { WireMockExtension, WiremockExtensionJar } from "@hellaweb3/wiremock-testcontainers-nodejs";
import { JARS } from "./jars";

/**
 * A JAR-only extension: `PoweredByTransformer` is declared in its JAR's `META-INF/services`, so
 * WireMock loads it by scanning – no class name needed. It adds `X-Powered-By:
 * wiremock-extensions` to every response.
 */
export class PoweredByTransformer implements WireMockExtension {
  /** WireMock's name for it. */
  static readonly NAME = "powered-by";
  /** The response header it adds, and its value. */
  static readonly HEADER = "X-Powered-By";
  static readonly VALUE = "wiremock-extensions";

  getName(): string {
    return PoweredByTransformer.NAME;
  }

  getJars(): WiremockExtensionJar[] {
    return [JARS.poweredBy];
  }
}
