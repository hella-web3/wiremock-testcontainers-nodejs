# Example TypeScript extensions

TypeScript extensions for WireMock's Java extensions – what the
**[guide for extension authors](https://hella-labs.github.io/wiremock-testcontainers-nodejs/docs/extensions/authoring-extensions)**
builds, recipe by recipe. Every snippet of that guide is embedded from these files.

| Example | File | Kind | Loads |
|---------|------|------|-------|
| `UppercaseTransformer` | [`uppercase-transformer.ts`](./uppercase-transformer.ts) | [Response transformer](https://wiremock.org/docs/extensibility/transforming-responses/) | Class + JAR |
| `BodyLengthMatcher` | [`body-length-matcher.ts`](./body-length-matcher.ts) | [Request matcher](https://wiremock.org/docs/extensibility/custom-matching/) | Class + JAR |
| `StubCountAdminApi` | [`stub-count-admin-api.ts`](./stub-count-admin-api.ts) | [Admin API route](https://wiremock.org/docs/extensibility/admin-api-extensions/) | Class + JAR |
| `PoweredByTransformer` | [`powered-by-transformer.ts`](./powered-by-transformer.ts) | Global transformer, found by scanning | JAR only |
| `GlobalResponseTemplating` | [`global-response-templating.ts`](./global-response-templating.ts) | WireMock's built-in templating | Options only |

Shared: [`java-extension.ts`](./java-extension.ts) (base class), [`jars.ts`](./jars.ts) (JAR
locations), [`stubs.ts`](./stubs.ts) (stub field types) and [`registry.ts`](./registry.ts) (the
extensions, ready to register), all exported by [`index.ts`](./index.ts).

| Tests | Shows | Docs |
|-------|-------|------|
| [`extensions.test.ts`](./extensions.test.ts) | Unit tests – what each extension loads, its helpers, validation – no container | [Testing](https://hella-labs.github.io/wiremock-testcontainers-nodejs/docs/extensions/authoring-extensions#testing) |
| [`extensions.e2e.test.ts`](./extensions.e2e.test.ts) | Each extension observed through a real request | [TypeScript extensions](https://hella-labs.github.io/wiremock-testcontainers-nodejs/docs/extensions/typescript-extensions) |
| [`java-extensions.e2e.test.ts`](./java-extensions.e2e.test.ts) | JARs, directories and class names without wrappers; extension options | [Java extensions](https://hella-labs.github.io/wiremock-testcontainers-nodejs/docs/extensions/java-extensions) |
