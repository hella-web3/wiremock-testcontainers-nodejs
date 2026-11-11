# WireMock Testcontainers for Node.js

[![Build](https://github.com/hella-web3/wiremock-testcontainers-nodejs/actions/workflows/main.yml/badge.svg)](https://github.com/hella-web3/wiremock-testcontainers-nodejs/actions/workflows/main.yml)
[![npm](https://img.shields.io/npm/v/%40hellaweb3%2Fwiremock-testcontainers-nodejs)](https://www.npmjs.com/package/@hellaweb3/wiremock-testcontainers-nodejs)
[![downloads](https://img.shields.io/npm/dm/%40hellaweb3%2Fwiremock-testcontainers-nodejs)](https://www.npmjs.com/package/@hellaweb3/wiremock-testcontainers-nodejs)

Run [WireMock](https://wiremock.org/) in [Testcontainers](https://node.testcontainers.org/) with a
fluent TypeScript API modelled on the official
[Java module](https://github.com/wiremock/wiremock-testcontainers-java): load stubs from
directories, files, npm packages or inline JSON; reset state between tests without restarting;
verify calls through WireMock's request journal.

## Install

```bash
npm i -D @hellaweb3/wiremock-testcontainers-nodejs testcontainers
```

Node.js >= 22.22 and a [container runtime](https://node.testcontainers.org/supported-container-runtimes/).
ESM and CJS, fully typed, `testcontainers` is the only dependency. pnpm >= 10 may report
`Ignored build scripts: ssh2, …` – optional native bindings of `testcontainers`, safe to ignore.

## Quick start

```typescript
import { afterAll, afterEach, beforeAll, expect, it } from "vitest"; // or Jest
import { type StartedWiremockContainer, WiremockContainer } from "@hellaweb3/wiremock-testcontainers-nodejs";

let wiremock: StartedWiremockContainer;

beforeAll(async () => {
  wiremock = await new WiremockContainer()
    .withMappings("./test/__mocks__/wiremock") // mappings/ + __files/
    .start();
  await wiremock.waitUntilReady();
}, 60_000); // the first image pull can be slow

afterEach(() => wiremock.reset()); // pristine stubs, empty journal – no restart
afterAll(() => wiremock.stop());

it("serves GET /cards", async () => {
  const response = await fetch(wiremock.getUrl("/cards"));

  expect(response.status).toBe(200);
  expect(await wiremock.countRequests({ method: "GET", url: "/cards" })).toBe(1);
});
```

## Registering stubs

```typescript
new WiremockContainer("wiremock/wiremock:3.13.0") // default: wiremock/wiremock
  .withMappings("./test/__mocks__/wiremock")     // a recorded directory
  .withMapping("health", "./fixtures/health.json")
  .withMapping("ping", { json: { request: { url: "/ping" }, response: { status: 200, body: "pong" } } })
  .withFiles("./fixtures/body.json", { file: "./logo.png", name: "img/logo.png" })
  .withCommand(["--global-response-templating"]); // any Testcontainers builder method
```

- **`withMappings(dir)`** copies `dir/mappings/` (required) and `dir/__files/` (optional).
- **`withMapping(name, source)`** registers one stub at `mappings/<name>.json`; `name` may
  contain `/`. The file may hold one stub or `{ "mappings": [...] }`.
- **`withFiles(...sources)`** registers response bodies at `__files/<name>`, the base name unless
  `name` is given. All or nothing.

| Source                             | Example                                                        |
|------------------------------------|----------------------------------------------------------------|
| Path (relative to cwd) or `file:` URL | `"./fixtures/a.json"`, `new URL("./a.json", import.meta.url)` |
| `{ file }`                         | `{ file: "./fixtures/a.json" }`                                 |
| `{ package, file }` – any file of an installed package | `{ package: "@acme/fixtures", file: "wiremock/a.json" }` |
| `{ module, file }` – next to a module | `{ module: import.meta.url, file: "./a.json" }` (CJS: `__dirname`) |
| `{ json }` – mappings only         | an object (serialised) or a string (copied verbatim)            |

Registrations are validated before any image is pulled: sources must exist, mappings must be
WireMock stubs, and nothing may overwrite another registration or reuse a stub `id`.

## Test utilities

`start()` resolves to a `StartedWiremockContainer`:

| Member                                    | Purpose                                                                 |
|-------------------------------------------|-------------------------------------------------------------------------|
| `rpcUrl`                                  | Base URL, e.g. `http://localhost:32768`                                 |
| `getUrl(path?)`                           | `getUrl("cards?page=1")` → `<rpcUrl>/cards?page=1`                       |
| `getAdminUrl()` / `getMappingUrl()`       | `<rpcUrl>/__admin` / `<rpcUrl>/__admin/mappings` (runtime stubs)        |
| `isRunning()`                             | `true` if WireMock is healthy; never throws                             |
| `waitUntilReady({ timeout?, interval? })` | Polls until healthy (defaults: 30 s, every 250 ms)                      |
| `reset()`                                 | Restore registered stubs and scenarios, clear the journal – no restart  |
| `resetRequests()`                         | Clear the journal only                                                  |
| `countRequests(criteria)`                 | Number of matching requests since the last reset                        |
| `findRequests(criteria)`                  | The matching `RecordedRequest`s (url, method, headers, body, …)          |
| `stop()`, `await using`                   | Stop the container                                                      |

`criteria` (`WiremockRequestCriteria`) uses WireMock's [request matching](https://wiremock.org/docs/request-matching/):

```typescript
const [request] = await wiremock.findRequests({
  method: "POST",
  urlPath: "/cards",
  headers: { "Content-Type": { equalTo: "application/json" } },
});
expect(JSON.parse(request.body ?? "")).toMatchObject({ cardType: "virtual" });
```

Also exported: `WaitUntilReadyOptions`, and the source types `WiremockMappingSource`,
`WiremockStaticFile`, `WiremockFileSource`, `WiremockPath` and `WiremockStubMapping`.

**Tips:** start one container per suite and `reset()` between tests, which is far faster than
restarting; raise the `beforeAll` timeout for the first image pull; assert with
`countRequests()`/`findRequests()` – they verify what actually went over the wire.

## Without Docker (local development only)

No container runtime? With Java 11+, `@hellaweb3/wiremock-testcontainers-nodejs/no-docker`
serves every `WiremockContainer` from a local WireMock JVM. Tests stay unchanged: stubs, files
and `withCommand()` flags apply as in the container.

> [!WARNING]
> Never the default, never for CI/CD: it refuses to run when CI is detected (`CI`,
> `GITHUB_ACTIONS`, …) and warns on every start. Results can differ from the Docker image; run
> with Docker before merging.

```bash
npm i -D wiremock # bundles the WireMock JAR (optional peer dependency)
```

```typescript
// test/no-docker.setup.ts
import { installNoDockerRuntime } from "@hellaweb3/wiremock-testcontainers-nodejs/no-docker";
installNoDockerRuntime();

// vitest.config.ts – opt-in only
setupFiles: process.env.WIREMOCK_NO_DOCKER === "1" ? ["./test/no-docker.setup.ts"] : [],
```

Set `WIREMOCK_NO_DOCKER=1` from a `--no-docker` script flag – see
[`examples/scripts/test-e2e.mjs`](./examples/scripts/test-e2e.mjs), which supports
`npm test --no-docker`.

| Option (`installNoDockerRuntime`) | Environment                  | Default                            |
|-----------------------------------|------------------------------|------------------------------------|
| `jar`                             | `WIREMOCK_JAR`               | the `wiremock` package's JAR       |
| `java`                            | `WIREMOCK_JAVA`, `JAVA_HOME` | `java`                             |
| `startupTimeout`                  | –                            | `60_000` ms                        |
| `cacheDir` (`false` disables)     | –                            | `<tmpdir>/wiremock-testcontainers` |
| `log`                             | –                            | `process.emitWarning`              |
| `env` – for the CI check and defaults | –                        | `process.env`                      |

- **Speed:** a C1-only JIT and a class-data archive per JAR and Java in `cacheDir`. The first run
  records it (a slower `stop()`); later runs boot ~2× faster and stop instantly. `JAVA_OPTS`
  override the JVM flags.
- **Differences:** WireMock listens on `127.0.0.1`; `exec()`, networks and copying after start
  throw; leftover JVMs are killed on exit.
- **Also exported:** `detectCI(env?)` – the CI variable set, if any; `isNoDockerRequested(env?)` –
  whether `NO_DOCKER_ENV` (`WIREMOCK_NO_DOCKER`) is `1` or `true`.

## More

- [`examples/`](./examples) – a standalone project using the package via `npm link`.
- [CONTRIBUTING.md](./CONTRIBUTING.md) – scripts, CI and tests.

Maintained by [Hella Labs](https://hellaweb3.com/). [MIT](./LICENSE) licensed.
