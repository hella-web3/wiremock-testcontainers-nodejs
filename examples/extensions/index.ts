/**
 * Example TypeScript WireMock extensions – `README.md` next to this file is the guide for
 * extension authors.
 *
 * | Extension                  | Kind                                  | Registers                    |
 * |----------------------------|---------------------------------------|------------------------------|
 * | `UppercaseTransformer`     | Response transformer                  | class name + JAR             |
 * | `BodyLengthMatcher`        | Custom request matcher                | class name + JAR             |
 * | `StubCountAdminApi`        | Admin API extension                   | class name + JAR             |
 * | `PoweredByTransformer`     | Global transformer, found by scanning | JAR only                     |
 * | `GlobalResponseTemplating` | WireMock's built-in templating        | options only, configurable   |
 */
export { BodyLengthMatcher, type BodyLengthParameters } from "./body-length-matcher";
export { GlobalResponseTemplating, type GlobalResponseTemplatingOptions } from "./global-response-templating";
export { JavaExtension, type JavaExtensionDefinition } from "./java-extension";
export { JARS, JAVA_PACKAGE } from "./jars";
export { PoweredByTransformer } from "./powered-by-transformer";
export { type AdminApi, StubCountAdminApi } from "./stub-count-admin-api";
export type { CustomMatcherFields, TransformerFields } from "./stubs";
export { UppercaseTransformer, type UppercaseParameters } from "./uppercase-transformer";
