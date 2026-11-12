# Writing WireMock extensions in TypeScript

WireMock extensions – response transformers, request matchers, admin API routes, … – are compiled
Java classes running inside WireMock. A **TypeScript extension** packages one for tests: it tells
`WiremockContainer` what to load (class names, JARs, CLI options) and adds typed helpers for the
stubs that use it. Nothing runs in Node.js while WireMock serves, and no JDK is needed.

Every snippet names its source file in its first line; [`README.test.ts`](./README.test.ts) fails
if one drifts from it, so all of them are type-checked, tested code.

| Example                    | File                                                               | Kind                                   | Loads             |
|----------------------------|--------------------------------------------------------------------|----------------------------------------|-------------------|
| `UppercaseTransformer`     | [`uppercase-transformer.ts`](./uppercase-transformer.ts)           | [Response transformer](https://wiremock.org/docs/extensibility/transforming-responses/) | Class + JAR |
| `BodyLengthMatcher`        | [`body-length-matcher.ts`](./body-length-matcher.ts)               | [Request matcher](https://wiremock.org/docs/extensibility/custom-matching/) | Class + JAR |
| `StubCountAdminApi`        | [`stub-count-admin-api.ts`](./stub-count-admin-api.ts)             | [Admin API route](https://wiremock.org/docs/extensibility/admin-api-extensions/) | Class + JAR |
| `PoweredByTransformer`     | [`powered-by-transformer.ts`](./powered-by-transformer.ts)         | Global transformer, found by scanning  | JAR only          |
| `GlobalResponseTemplating` | [`global-response-templating.ts`](./global-response-templating.ts) | WireMock's built-in templating         | Options only      |

Shared: [`java-extension.ts`](./java-extension.ts) (base class), [`jars.ts`](./jars.ts) (JAR
locations, `JARS` and `JAVA_PACKAGE`), [`stubs.ts`](./stubs.ts) (stub field types), all exported
by [`index.ts`](./index.ts).

## The contract

`WireMockExtension`, from `@hellaweb3/wiremock-testcontainers-nodejs`:

| Member            | Required         | WireMock gets                                                               |
|-------------------|------------------|-----------------------------------------------------------------------------|
| `getName()`       | Yes              | Nothing – it identifies the extension. The same name again: a no-op if configured alike, else an error |
| `getClassNames()` | At least one of these three | Fully qualified class names, merged into one `--extensions` flag |
| `getJars()`       | ″                | JARs or directories of them, on its class path – any file source          |
| `getOptions()`    | ″                | CLI options, one per entry: `"--flag"` or `"--option=value"`; exact repeats are dropped, conflicts rejected |

Register a **class** (its constructor must take no arguments), an **instance** (to configure
it) or an **object literal**. JARs are validated on registration, class names on `start()` –
before anything starts.

## Recipes

### Wrap a Java class

[`JavaExtension`](./java-extension.ts) turns name, class and JAR into one `super()` call:

```typescript
// extensions/java-extension.ts
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
```

```typescript
// extensions/uppercase-transformer.ts
export class UppercaseTransformer extends JavaExtension {
  /** WireMock's name for it – what stubs list in `transformers`. */
  static readonly NAME = "uppercase";
  /** The response header it adds. */
  static readonly HEADER = "X-Transformed-By";

  constructor() {
    super({ name: UppercaseTransformer.NAME, className: `${JAVA_PACKAGE}.UppercaseTransformer`, jar: JARS.examples });
  }
```

Keep WireMock's name in `static readonly NAME` – `getName()`, helpers and tests share it – and
expose what tests assert on, like `HEADER`.

### Typed stub helpers

Stubs apply extensions through fields; [`stubs.ts`](./stubs.ts) types them:

```typescript
// extensions/stubs.ts
/** Added to a stub's `response`: the transformers to run and their parameters. */
export interface TransformerFields<Parameters extends object = object> {
  readonly transformers: readonly string[];
  readonly transformerParameters?: Parameters;
}

/** Added to a stub's `request`: a custom matcher and its parameters. */
export interface CustomMatcherFields<Parameters extends object = object> {
  readonly customMatcher: { readonly name: string; readonly parameters: Parameters };
}
```

Each extension returns them from a static helper, typed and validated – a bad parameter fails
where it is written, not as a silent mismatch inside WireMock:

```typescript
// extensions/uppercase-transformer.ts
  static transform(parameters: UppercaseParameters = {}): TransformerFields<UppercaseParameters> {
    return {
      transformers: [UppercaseTransformer.NAME],
      ...(parameters.suffix === undefined ? {} : { transformerParameters: { suffix: parameters.suffix } }),
    };
  }
```

```typescript
// extensions/body-length-matcher.ts
  static longerThan(maxLength: number): CustomMatcherFields<BodyLengthParameters> {
    if (!Number.isInteger(maxLength) || maxLength < 0) {
      throw new RangeError(`maxLength must be a non-negative integer, got ${maxLength}`);
    }
    return { customMatcher: { name: BodyLengthMatcher.NAME, parameters: { maxLength } } };
  }
```

### Admin API clients

Wrap the routes an admin API extension adds. Accept only `Pick<StartedWiremockContainer,
"getAdminUrl">`, so unit tests can pass a fake, and name the likely cause on failure:

```typescript
// extensions/stub-count-admin-api.ts
  static async count(wiremock: AdminApi): Promise<number> {
    const url = `${wiremock.getAdminUrl()}${StubCountAdminApi.ROUTE}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`GET ${url} failed with ${response.status} – is StubCountAdminApi registered?`);
    const { count } = (await response.json()) as { count: number };
    return count;
  }
```

### JAR-only extensions

A JAR listing its classes in `META-INF/services/com.github.tomakehurst.wiremock.extension.Extension`
is loaded by WireMock's scanning – the extension only provides the JAR:

```typescript
// extensions/powered-by-transformer.ts
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
```

With `withExtensionOptions({ scanning: false })` such classes need `getClassNames()` after all.

### Configurable extensions

Take configuration through an optional constructor parameter – the class still registers with
defaults – copy it, and **validate it there**: WireMock crashes at start-up on a bad value
(`--max-template-cache-entries=abc` → `NumberFormatException`).

```typescript
// extensions/global-response-templating.ts
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
```

### One-off extensions

An object literal is enough for one suite:

```typescript
// e2e/raw-extensions.e2e.test.ts
const shortJournal: WireMockExtension = {
  getName: () => "short-journal",
  getOptions: () => ["--max-request-journal=2"],
};
```

### Locating JARs

Resolve JARs next to the module declaring them – `{ module: import.meta.url, file }` (CommonJS:
`{ module: __dirname, file }`) – not against the working directory, which differs between IDE,
monorepo root and CI. `satisfies` checks every entry and keeps the literal types:

```typescript
// extensions/jars.ts
export const JARS = {
  /** `UppercaseTransformer`, `BodyLengthMatcher`, `StubCountAdminApi` – loaded by class name. */
  examples: { module: import.meta.url, file: "../__mocks__/extensions/example-extensions.jar" },
  /** `PoweredByTransformer`, declared in `META-INF/services` – loaded by scanning. */
  poweredBy: { module: import.meta.url, file: "../__mocks__/extensions/powered-by-extension.jar" },
} as const satisfies Record<string, WiremockExtensionJar>;
```

A JAR shipped in an npm package: `{ package: "@acme/wiremock-extensions", file: "jars/acme.jar" }`.

## Using extensions

Classes are instantiated for you; instances carry configuration; a shared JAR is copied once:

```typescript
// e2e/extensions.e2e.test.ts
    wiremock = await new WiremockContainer()
      .withName("wiremock-examples-extensions")
      // Classes are instantiated for you; the shared JAR is copied once.
      .withExtensions([UppercaseTransformer, BodyLengthMatcher, StubCountAdminApi, PoweredByTransformer])
      // An instance carries configuration.
      .withExtension(new GlobalResponseTemplating({ maxCacheEntries: 100 }))
      .withMapping("payments-extended", { json: { mappings: PAYMENT_STUBS } })
      .start();
```

Stubs and assertions use the helpers and constants instead of strings:

```typescript
// e2e/extensions.e2e.test.ts
  {
    request: { method: "GET", url: "/payments/status" },
    response: { status: 200, body: "all systems go", ...UppercaseTransformer.transform({ suffix: "!" }) },
  },
```

```typescript
// e2e/extensions.e2e.test.ts
  it("UppercaseTransformer upper-cases bodies, with and without a suffix", async () => {
    const status = await fetch(wiremock.getUrl("/payments/status"));
    expect(status.headers.get(UppercaseTransformer.HEADER)).toBe(UppercaseTransformer.NAME);
    expect(await status.text()).toBe("ALL SYSTEMS GO!");
    expect(await (await fetch(wiremock.getUrl("/payments/motto"))).text()).toBe("PAY ON TIME");
  });
```

Without a wrapper class, register the JAR and class name directly:

```typescript
// e2e/raw-extensions.e2e.test.ts
    wiremock = await new WiremockContainer()
      .withExtensionJar("./__mocks__/extensions/example-extensions.jar")
      .withExtension("com.hellaweb3.wiremock.extensions.UppercaseTransformer")
      .withExtension(shortJournal)
```

## Testing

Unit tests need no container – assert what an extension loads, its validation and its clients
([`extensions.test.ts`](./extensions.test.ts)):

```typescript
// extensions/extensions.test.ts
  it.each([
    [UppercaseTransformer, "uppercase", [`${JAVA_PACKAGE}.UppercaseTransformer`], [JARS.examples]],
    [BodyLengthMatcher, "body-too-long", [`${JAVA_PACKAGE}.BodyLengthMatcher`], [JARS.examples]],
    [StubCountAdminApi, "stub-count", [`${JAVA_PACKAGE}.StubCountAdminApi`], [JARS.examples]],
  ])("%o: a Java class from the example JAR", (Extension, name, classNames, jars) => {
    const extension = new Extension();
    expect(extension.getName()).toBe(name);
    expect(extension.getClassNames()).toEqual(classNames);
    expect(extension.getJars()).toEqual(jars);
  });
```

Even `start()` checks class names against the registered JARs before starting anything:

```typescript
// extensions/extensions.test.ts
  it("a class in none of the registered JARs fails start() with a suggestion", async () => {
    const typo = new WiremockContainer().withExtensionJar(JARS.examples).withExtension("com.acme.UppercaseTransformer");
    await expect(typo.start()).rejects.toThrow(`did you mean "${JAVA_PACKAGE}.UppercaseTransformer"?`);
  });
```

E2E tests ([`../e2e/`](../e2e/)) start WireMock once per suite, `reset()` between tests, and
observe each extension through a real request.

```bash
npm run test:unit           # extensions/ – no container; coverage enforced at 100 % per file
npm run test:e2e            # e2e/ – Docker
npm test -- --no-docker     # everything; WireMock as a local JVM (Java 11+, never in CI)
```

## Troubleshooting

All raised before a container starts, and each triggered in [`extensions.test.ts`](./extensions.test.ts):

| Error contains                                    | Fix                                                                   |
|---------------------------------------------------|-----------------------------------------------------------------------|
| `is not a fully qualified Java class name`        | Pass the class with its package, not its short name, path or `.class` |
| `it contributes nothing`                          | Implement `getClassNames()`, `getJars()` or `getOptions()`            |
| `must be "--flag" or "--option=value"`            | One entry per option: `"--max-request-journal=2"`                     |
| `does not exist`                                  | Locate the JAR with `{ module: import.meta.url, file }`               |
| `must end in ".jar"`                              | Rename it: `{ file, name: "x.jar" }`                                  |
| `did you mean …?` (on `start()`)                  | Fix the class name, or register the JAR containing it                 |
| `another extension named … is already registered` | One configuration per name                                            |

If WireMock itself fails, the error lists the extensions in use: `ClassNotFoundException` means a
missing class, `UnsupportedClassVersionError` a JAR built for a newer Java than 11.

## Publishing

Ship extensions and their JARs as an npm package: list the JARs in `"files"`, locate them with
`{ module: import.meta.url, file: "../jars/acme.jar" }`, and make
`@hellaweb3/wiremock-testcontainers-nodejs` a peer dependency so consumers' copy is used.
