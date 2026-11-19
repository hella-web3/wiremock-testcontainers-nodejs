/**
 * The example extensions, ready to register: classes for the defaults, instances to configure.
 *
 * @see https://hella-labs.github.io/wiremock-testcontainers-nodejs/docs/extensions/typescript-extensions
 */
import type { ExtensionConstructor, ExtensionInput } from "@hellaweb3/wiremock-testcontainers-nodejs";
import { BodyLengthMatcher } from "./body-length-matcher";
import { GlobalResponseTemplating } from "./global-response-templating";
import { PoweredByTransformer } from "./powered-by-transformer";
import { StubCountAdminApi } from "./stub-count-admin-api";
import { UppercaseTransformer } from "./uppercase-transformer";

// #region constructors
/** Extension classes with a no-argument constructor: `withExtensions()` instantiates them. */
export const EXTENSION_CLASSES: readonly ExtensionConstructor[] = [
  UppercaseTransformer,
  BodyLengthMatcher,
  StubCountAdminApi,
  PoweredByTransformer,
];
// #endregion constructors

// #region inputs
/** Classes, configured instances and Java class names mix freely: each is an `ExtensionInput`. */
export const PAYMENTS_EXTENSIONS: readonly ExtensionInput[] = [
  ...EXTENSION_CLASSES,
  new GlobalResponseTemplating({ maxCacheEntries: 100 }),
];
// #endregion inputs
