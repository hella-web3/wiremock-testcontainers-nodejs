# WireMock extension fixtures

Compiled WireMock 3 extensions (Java 11 bytecode) for the tests and [`examples/`](../../../examples).
The project has no Java source and needs no JDK: `pnpm build:extensions` packs each
`<jar>/classes/` directory into `<jar>.jar` – and its copy in `examples/__mocks__/extensions/` –
with Node.js alone.

| Class (`com.hellaweb3.wiremock.extensions.*`) | JAR | Kind | Behaviour |
|---|---|---|---|
| `UppercaseTransformer` | `example-extensions.jar` | [Response transformer](https://wiremock.org/docs/extensibility/transforming-responses/) `uppercase` | For stubs with `"transformers": ["uppercase"]`: upper-cases the body, appends the `suffix` transformer parameter, adds `X-Transformed-By: uppercase` |
| `StubCountAdminApi` | `example-extensions.jar` | [Admin API extension](https://wiremock.org/docs/extensibility/admin-api-extensions/) `stub-count` | `GET /__admin/stub-count` → `{"count": <number of stubs>}` |
| `BodyLengthMatcher` | `example-extensions.jar` | [Custom request matcher](https://wiremock.org/docs/extensibility/custom-matching/) `body-too-long` | `"customMatcher": {"name": "body-too-long", "parameters": {"maxLength": 16}}` matches bodies longer than `maxLength` |
| `PoweredByTransformer` | `powered-by-extension.jar` | Global response transformer `powered-by` | Adds `X-Powered-By: wiremock-extensions` to every response; declared in `META-INF/services/com.github.tomakehurst.wiremock.extension.Extension`, so WireMock loads it by scanning, without `--extensions` |

`example-extensions.jar` has no `META-INF/services`: its classes load only by class name.
