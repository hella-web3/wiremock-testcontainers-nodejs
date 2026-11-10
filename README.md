<!--suppress HtmlDeprecatedAttribute -->
<div align="center">

<h1>WireMock Testcontainers Node.js Typescript</h1>

<p>A library for easily using WireMock with Testcontainers in Node.js applications.</p>

<a href="https://github.com/hella-web3/wiremock-testcontainers-nodejs/actions/workflows/main.yml ">
    <img alt="Build Status" src="https://github.com/hella-web3/wiremock-testcontainers-nodejs/actions/workflows/main.yml/badge.svg" />
</a>

<a href="https://www.npmjs.com/package/@hellaweb3/wiremock-testcontainers-nodejs">
<img alt="npm version" src="https://img.shields.io/npm/v/%40hellaweb3%2Fwiremock-testcontainers-nodejs" />
</a>

<a href="https://www.npmjs.com/package/@hellaweb3/wiremock-testcontainers-nodejs">
<img alt="npm downloads" src="https://img.shields.io/npm/dm/%40hellaweb3%2Fwiremock-testcontainers-nodejs" />
</a>

</div>

## Description

`wiremock-testcontainers-nodejs` is a Typescript nodejs library that spins up
a [WireMock](https://wiremock.org/)
instance with [Testcontainers](https://node.testcontainers.org/). It provides a
fluent API to configure and start WireMock
containers from recorded WireMock directories, individual named mappings
(local files, npm packages, module-relative files or inline JSON) and static
files – an API modelled on the official
[Java module](https://github.com/wiremock/wiremock-testcontainers-java).

## Installation

```bash
pnpm add -D @hellaweb3/wiremock-testcontainers-nodejs testcontainers
```

Requires Node.js >= 22.22 and a reachable Docker daemon (anything
[Testcontainers](https://node.testcontainers.org/supported-container-runtimes/)
supports).

**What you get:** a ~17 kB package – dual ESM (`dist/index.js`) and CJS
(`dist/index.cjs`) builds with matching declarations, `sideEffects: false`
for tree-shaking, `testcontainers` as the single runtime dependency (never
bundled), and the TypeScript source for go-to-definition.

**pnpm users:** pnpm >= 10 may report `Ignored build scripts: ssh2, protobufjs,
cpu-features`. These are transitive dependencies of `testcontainers`; the
scripts only build an *optional* native crypto binding for `ssh2`, which falls
back to pure JavaScript. It is safe to leave them ignored.

## Usage

### Basic Example

1. Record or hand-write your stubs in the standard WireMock layout, e.g.
   `test/__mocks__/wiremock/mappings/*.json` and
   `test/__mocks__/wiremock/__files/*.json`.
2. Start a `WiremockContainer` once per suite, point it at that directory and
   use `rpcUrl` as the base URL of the API under test.
3. Stop the container when the suite finishes.

```typescript
import { afterAll, beforeAll, describe, expect, it } from "vitest"; // or jest
import {
  StartedWiremockContainer,
  WiremockContainer,
} from "@hellaweb3/wiremock-testcontainers-nodejs";

describe("Cards API", () => {
  let container: StartedWiremockContainer;

  beforeAll(async () => {
    container = await new WiremockContainer()        // wiremock/wiremock:latest
      .withMappings("./test/__mocks__/wiremock")      // mappings/ + __files/
      .start();                                       // waits for port 8080
  }, 60_000);                                         // image pull can be slow

  afterAll(async () => {
    await container.stop();
  });

  it("serves the recorded GET /cards stub", async () => {
    const response = await fetch(`${container.rpcUrl}/cards`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.items).toHaveLength(6);
  });

  it("exposes the WireMock admin API", async () => {
    const response = await fetch(`${container.rpcUrl}/__admin/mappings`);
    const { meta } = await response.json();
    expect(meta.total).toBe(2);
  });
});
```

`WiremockContainer` extends Testcontainers' `GenericContainer`, so every
builder method is available – for example to pin an image, name the container
or pass WireMock CLI flags:

```typescript
const container = await new WiremockContainer("wiremock/wiremock:3.13.0")
  .withName("wiremock-cards-api")
  .withCommand(["--verbose", "--global-response-templating"])
  .withMappings("./test/__mocks__/wiremock")
  .start();
```

### With Mappings and Files

WireMock uses a specific directory structure for mappings and static files. This
library makes it easy to mount these into the container.

**Project structure:**

```
test/
└── __mocks__/
    └── wiremock/
        ├── mappings/
        │   └── my-mapping.json
        └── __files/
            └── some-data.json
```

```typescript
import { WiremockContainer } from "@hellaweb3/wiremock-testcontainers-nodejs";

const container = await new WiremockContainer()
  .withMappings("./test/__mocks__/wiremock")
  .start();
```

### Individual mappings and files

`withMapping(name, source)` registers one stub at `mappings/<name>.json` and
`withFiles(...files)` registers response bodies in `__files/` – no recorded
directory required. A mapping file holds one WireMock stub, or several under
`"mappings"`:

```json
{ "request": { "method": "GET", "url": "/health" }, "response": { "status": 200, "jsonBody": { "status": "UP" } } }
```

#### Mapping sources

**Local file** – a path relative to the working directory, or absolute:

```typescript
new WiremockContainer().withMapping("health", "./test/fixtures/health.json"); // → mappings/health.json
```

**`file:` URL** – e.g. relative to the current module:

```typescript
new WiremockContainer().withMapping("health", new URL("./fixtures/health.json", import.meta.url));
```

**`{ file }`** – a path or URL in object form:

```typescript
new WiremockContainer().withMapping("health", { file: "./test/fixtures/health.json" });
```

**`{ package, file }`** – a file inside an installed npm package, e.g. shared
fixtures. Resolved like `require()` from the working directory; the file does
not need to be exported and may not leave the package:

```typescript
new WiremockContainer().withMapping("cards/list", { package: "@acme/api-fixtures", file: "wiremock/cards.json" }); // → mappings/cards/list.json
```

**`{ module, file }`** – a file relative to a module, like a Java classpath
resource:

```typescript
new WiremockContainer().withMapping("balance", { module: import.meta.url, file: "./__mocks__/balance.json" }); // ESM
new WiremockContainer().withMapping("balance", { module: __dirname, file: "./__mocks__/balance.json" });       // CJS (or __filename)
```

**`{ json }` (object)** – an inline stub, serialised as-is:

```typescript
new WiremockContainer().withMapping("ping", {
  json: { request: { method: "GET", url: "/ping" }, response: { status: 200, body: "pong" } },
});
```

**`{ json }` (string)** – inline JSON, copied verbatim:

```typescript
new WiremockContainer().withMapping("ping", { json: '{ "request": { "url": "/ping" }, "response": { "status": 200 } }' });
```

**Several stubs in one mapping** – any source may hold `{ "mappings": [...] }`:

```typescript
new WiremockContainer().withMapping("greetings", {
  json: {
    mappings: [
      { request: { url: "/hello" }, response: { status: 200, body: "Hello" } },
      { request: { url: "/bye" }, response: { status: 200, body: "Bye" } },
    ],
  },
});
```

#### Static files

`withFiles()` takes the same file sources (not `{ json }`). A file keeps its
base name unless an object source sets `name`; mappings reference it as
`bodyFileName`:

```typescript
new WiremockContainer().withFiles(
  "./test/fixtures/body-cards.json",                                     // → __files/body-cards.json
  { file: "./test/fixtures/logo.png", name: "images/logo.png" },        // → __files/images/logo.png
  { package: "@acme/api-fixtures", file: "wiremock/__files/user.json" }, // → __files/user.json
);
```

#### Combining them

All three methods chain with each other and with every Testcontainers builder:

```typescript
const container = await new WiremockContainer()
  .withMappings("./test/__mocks__/wiremock")
  .withMapping("health", "./test/fixtures/health.json")
  .withMapping("cards/list", { package: "@acme/api-fixtures", file: "wiremock/cards.json" })
  .withFiles({ file: "./test/fixtures/cards.json", name: "cards/body.json" })
  .start();
```

Registrations are validated immediately, before any image is pulled: sources
must exist, mappings must be WireMock stubs, and no registration may overwrite a
file of another or reuse a stub `id` (WireMock would refuse to start).
Registering the same file at the same path again is a no-op. Sources are only
read – mappings are copied byte-for-byte as of registration.

## API

### `WiremockContainer`

- `constructor(image?: string)`: Create a new container. Defaults to
  `wiremock/wiremock`.
- `withMappings(directory: string)`: Copies `mappings/` (required) and
  `__files/` (optional) from the specified local directory into the container.
  Throws immediately if `mappings/` does not exist, so a typo fails before any
  image is pulled.
- `withMapping(name: string, source: WiremockMappingSource)`: Registers one stub
  at `mappings/<name>.json` (`name` may contain `/`; `.json` is optional).
- `withFiles(...files: WiremockStaticFile[])`: Registers files at
  `__files/<name>` – the base name unless an object source sets `name`. A call
  registers all files or none.
- `start()`: Starts the container and returns a `StartedWiremockContainer`.
  Runtime failures (no daemon, image pull denied, start-up timeout, name or
  port conflicts) are propagated unchanged.

### `StartedWiremockContainer`

- `rpcUrl`: Returns the base URL of the running WireMock instance (e.g.,
  `http://localhost:32768`).
- `stop()`: Stops the container (inherited from Testcontainers).
- `[Symbol.asyncDispose]`: `await using container = await new WiremockContainer().start();`
  stops the container automatically when the scope exits (TypeScript 5.2+).

## Best Practices

1. **Test Isolation**: Start a new container for each test suite (or even each
   test if performance allows) to ensure a clean state.
2. **Mapping Organization**: Keep your mappings organized in a dedicated
   directory structure that mirrors your API endpoints.
3. **Timeouts**: Docker container startup can sometimes exceed the default test
   runner timeout (e.g. 5 s in Jest, 10 s in Vitest). Always set a higher timeout for
   `beforeAll` hooks that start containers.
4. **Resource Management**: Always ensure `container.stop()` is called in an
   `afterAll` or `afterEach` block to prevent orphaned containers.

## Development

Tooling: [Vitest](https://vitest.dev/) (tests + v8 coverage),
[oxlint](https://oxc.rs/docs/guide/usage/linter) (lint), `tsc` (typecheck)
and [tsdown](https://tsdown.dev/) (build – rolldown + oxc, emitting
declarations natively via `isolatedDeclarations` in `tsconfig.build.json`).
Node version: see `.nvmrc`.

### Scripts

| Command              | What it does                                                             | Needs Docker |
|----------------------|--------------------------------------------------------------------------|--------------|
| `pnpm build`         | ESM + CJS + declarations into `dist/`, then `publint` + `attw` checks    | No           |
| `pnpm typecheck`     | `tsc --noEmit` over `src/` and `test/`                                   | No           |
| `pnpm lint`          | `oxlint --deny-warnings` with the rules in `.oxlintrc.json`              | No           |
| `pnpm test:unit`     | `test/unit/**` – container wrapper logic, registration API and fixture integrity checks | No |
| `pnpm test:e2e`      | `test/index.test.ts` – a real WireMock container serving the fixtures    | **Yes**      |
| `pnpm test`          | Both suites, no coverage (fast local loop)                               | **Yes**      |
| `pnpm test:coverage` | Both suites with coverage of `src/`, thresholds enforced                 | **Yes**      |
| `pnpm check`         | `build` + `typecheck` + `lint` + `test:coverage` – the full CI gate      | **Yes**      |

Append `--coverage` to any test script to collect coverage for that run, e.g.
`pnpm test:unit --coverage`. Coverage thresholds are **95 %** for statements,
branches, functions and lines; the unit suite alone currently reaches 100 %
and completes in well under two seconds of test time.

### Running the E2E suite in containerised environments

The E2E suite starts a real container through Testcontainers, so the test
process needs a container runtime it can talk to. Without one, `pnpm test:e2e`,
`pnpm test` and `pnpm check` fail in the E2E suite with:

```
Could not find a working container runtime strategy
```

In that situation the Docker-free loop still covers build, types, lint and
100 % of `src/`:

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test:unit --coverage
```

Testcontainers resolves a runtime in this order; pick whichever your
environment can provide:

| Environment                                   | How to enable E2E                                                                                                                                   |
|-----------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------|
| GitHub Codespaces / VS Code Dev Containers    | Use the provided `.devcontainer/devcontainer.json` – it adds the `docker-in-docker` feature, so a daemon runs inside the dev container.             |
| Dev container with the host socket mounted    | Add the `docker-outside-of-docker` feature (or mount `/var/run/docker.sock`). Set `TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal` if port lookups fail. |
| Remote or rootless daemon                     | `DOCKER_HOST=tcp://host:2375` (or `unix:///path/to/docker.sock`).                                                                                    |
| Podman                                        | `DOCKER_HOST=unix://$XDG_RUNTIME_DIR/podman/podman.sock` and `TESTCONTAINERS_RYUK_DISABLED=true` (or run Ryuk privileged).                             |
| No runtime can be installed (locked-down sandbox) | [Testcontainers Cloud](https://testcontainers.com/cloud/): run the agent and export `TC_CLOUD_TOKEN`; containers start remotely, tests run locally. |

Sandboxes that have **no runtime binary and no socket at all** (as is the case
for some hosted dev VMs) cannot run the E2E suite; the suite states this in its
header comment and `pnpm test:unit` is the supported loop there.

CI (`.github/workflows/main.yml`) runs build, typecheck, lint, unit tests
(with coverage) and E2E tests as separate steps on `ubuntu-latest`, which
ships with Docker, for every active Node LTS line.

### Supply-chain controls

- `pnpm install --frozen-lockfile` everywhere; the lockfile is the source of truth.
- `pnpm-workspace.yaml` allow-lists the only packages permitted to run install
  scripts (`ssh2`, `cpu-features`, `protobufjs` – all transitive via
  `testcontainers`) and sets `minimumReleaseAge: 1440` so a version must be at
  least 24 h old before it can be resolved.
- CI runs `pnpm audit --prod --audit-level=high` on every push and PR;
  Dependabot (`.github/dependabot.yml`) proposes weekly updates with a 3-day
  cooldown, grouping dev tooling and leaving `testcontainers` bumps individual.
- `pnpm build` runs [publint](https://publint.dev/) and
  [Are the types wrong?](https://arethetypeswrong.github.io/) against the
  emitted package; `size.yml` fails a PR if the tarball exceeds 25 kB.
- Releases publish with npm provenance (`--provenance`, OIDC) after a
  Docker-free verify step.

### Fixtures and schema-based assertions

The recorded WireMock session lives in `test/__mocks__/wiremock`:

- `mappings/*.json` – one stub per endpoint (`request.url`, `response.status`,
  `response.headers`, `response.bodyFileName`).
- `__files/*.json` – the response bodies referenced by the mappings.

`test/helpers/fixtures.ts` loads these from disk and declares the TypeScript
shapes of every JSON payload. `test/helpers/assertions.ts` declares a
`Schema<T>` per payload – stub mappings, the admin API response and each
recorded body. The compiler requires a schema to cover **every** field of
`T`; `expectObject` then asserts each field's shape, its recorded value and
the exact key set (`partialOf` relaxes the key set for third-party shapes).

The E2E suite runs a mapping-driven contract test for every file in
`mappings/` (status, headers and full JSON body), so adding a new recorded
mapping automatically puts it under test. Endpoint-specific suites add
schema assertions, which the unit suite also runs against the fixture files
themselves to catch drift early.

Negative cases are hand-written stubs alongside the recorded ones:

- `mapping-cards-bad-request-400.json` – `GET /cards?page=0` → 400 with a
  validation error envelope.
- `mapping-account-balance-server-error-500.json` – `GET /account/balance`
  → 500 **only** when the request carries `X-Mock-Scenario: server-error`.
  It sets `"priority": 1` so it wins over the recorded 200 stub for the same
  URL; without the header the 200 stub is still served. This is the standard
  WireMock pattern for simulating outages on demand.

Unmatched requests (unknown path, wrong method) get WireMock's default 404.

`test/__mocks__/standalone` holds loose fixtures for `withMapping()` and
`withFiles()`. Their unit tests need no Docker: `test/helpers/container.ts`
reads the tar archive Testcontainers would upload and asserts exactly which
files land where.

## Maintainers

Maintained by [Hella Labs](https://hellaweb3.com/).

## License

MIT
