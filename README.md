# WireMock Testcontainers for Node.js

[![Build](https://github.com/hella-labs/wiremock-testcontainers-nodejs/actions/workflows/main.yml/badge.svg)](https://github.com/hella-labs/wiremock-testcontainers-nodejs/actions/workflows/main.yml)
[![Docs](https://github.com/hella-labs/wiremock-testcontainers-nodejs/actions/workflows/docs.yml/badge.svg)](https://hella-labs.github.io/wiremock-testcontainers-nodejs/)
[![npm](https://img.shields.io/npm/v/%40hellaweb3%2Fwiremock-testcontainers-nodejs)](https://www.npmjs.com/package/@hellaweb3/wiremock-testcontainers-nodejs)
[![downloads](https://img.shields.io/npm/dm/%40hellaweb3%2Fwiremock-testcontainers-nodejs)](https://www.npmjs.com/package/@hellaweb3/wiremock-testcontainers-nodejs)

Run [WireMock](https://wiremock.org/) in [Testcontainers](https://node.testcontainers.org/) with a
fluent TypeScript API modelled on the official
[Java module](https://github.com/wiremock/wiremock-testcontainers-java): load stubs from
directories, files, npm packages or inline JSON; reset state between tests without restarting;
verify calls through WireMock's request journal.

**[Documentation](https://hella-labs.github.io/wiremock-testcontainers-nodejs/)** ·
[Quick start](https://hella-labs.github.io/wiremock-testcontainers-nodejs/docs/getting-started/quick-start) ·
[Guides](https://hella-labs.github.io/wiremock-testcontainers-nodejs/docs/guides/registering-stubs) ·
[API reference](https://hella-labs.github.io/wiremock-testcontainers-nodejs/docs/api) ·
[Examples](./examples)

## Install

```bash
npm i -D @hellaweb3/wiremock-testcontainers-nodejs
```

Node.js >= 22.22 and a [container runtime](https://node.testcontainers.org/supported-container-runtimes/).
ESM and CJS, fully typed, `testcontainers` is the only dependency. pnpm >= 10 may report
`Ignored build scripts: ssh2, …` – optional native bindings of `testcontainers`, safe to ignore.

## Quick start

<!-- snippet: getting-started/quick-start.e2e.test.ts#quick-start -->
```typescript
import { afterAll, afterEach, beforeAll, expect, it } from "vitest"; // or Jest
import { type StartedWiremockContainer, WiremockContainer } from "@hellaweb3/wiremock-testcontainers-nodejs";
import { PaymentsClient } from "../app/payments-client"; // the code under test

let wiremock: StartedWiremockContainer;

beforeAll(async () => {
  wiremock = await new WiremockContainer()
    .withMappings("./__mocks__/wiremock") // mappings/ + __files/
    .start();
  await wiremock.waitUntilReady();
}, 120_000); // the first image pull can be slow

afterEach(() => wiremock.reset()); // pristine stubs, empty journal – no restart
afterAll(() => wiremock?.stop());

it("lists the recorded payments", async () => {
  const page = await new PaymentsClient(wiremock.getUrl()).list();

  expect(page.meta.totalItems).toBe(2);
  expect(await wiremock.countRequests({ method: "GET", url: "/payments" })).toBe(1);
});
```

`PaymentsClient` stands for your code under test – any HTTP client pointed at `wiremock.getUrl()`.
The [quick start](https://hella-labs.github.io/wiremock-testcontainers-nodejs/docs/getting-started/quick-start)
walks through it.

## What you can do

| Task | API | Guide |
|------|-----|-------|
| Serve stubs from directories, files, packages or inline JSON | `withMappings()`, `withMapping()`, `withFiles()` | [Registering stubs](https://hella-labs.github.io/wiremock-testcontainers-nodejs/docs/guides/registering-stubs), [file sources](https://hella-labs.github.io/wiremock-testcontainers-nodejs/docs/guides/file-sources) |
| Pin the image, pass WireMock options | `new WiremockContainer(image)`, `withCommand()` | [Configuring the container](https://hella-labs.github.io/wiremock-testcontainers-nodejs/docs/guides/configuring-the-container) |
| Start, wait, build URLs, stop | `start()`, `waitUntilReady()`, `getUrl()`, `await using` | [Container lifecycle](https://hella-labs.github.io/wiremock-testcontainers-nodejs/docs/guides/container-lifecycle) |
| Isolate tests without restarts | `reset()`, `resetRequests()` | [Test isolation](https://hella-labs.github.io/wiremock-testcontainers-nodejs/docs/guides/test-isolation) |
| Verify what your code sent | `countRequests()`, `findRequests()` | [Verifying requests](https://hella-labs.github.io/wiremock-testcontainers-nodejs/docs/guides/verifying-requests) |
| Load WireMock extensions from JARs – no JDK | `withExtensionJar()`, `withExtension()` | [Java extensions](https://hella-labs.github.io/wiremock-testcontainers-nodejs/docs/extensions/java-extensions), [TypeScript extensions](https://hella-labs.github.io/wiremock-testcontainers-nodejs/docs/extensions/typescript-extensions) |
| Develop without Docker | `installNoDockerRuntime()` | [Running without Docker](https://hella-labs.github.io/wiremock-testcontainers-nodejs/docs/guides/running-without-docker) |

Registrations are validated before any image is pulled: sources must exist, mappings must be
WireMock stubs, and nothing may overwrite another registration or reuse a stub `id`. Every export
is listed in the [API overview](https://hella-labs.github.io/wiremock-testcontainers-nodejs/docs/reference/api-overview);
errors are explained in [troubleshooting](https://hella-labs.github.io/wiremock-testcontainers-nodejs/docs/reference/troubleshooting).

## Without Docker (local development only)

No container runtime? With Java 11+ and the optional `wiremock` peer dependency,
`@hellaweb3/wiremock-testcontainers-nodejs/no-docker` serves every `WiremockContainer` from a
local WireMock JVM – tests unchanged. It is never the default, warns on every start and refuses to
run in CI/CD. See [running without Docker](https://hella-labs.github.io/wiremock-testcontainers-nodejs/docs/guides/running-without-docker).

## Running the docs locally

The site lives in [`docs/`](./docs), an npm project of its own. From the repository root,
`pnpm docs:<script>` runs its script of that name – installing `docs/` when needed; from `docs/`,
`npm run <script>` does the same:

```bash
pnpm install        # once
pnpm docs:start     # live preview – in docs/: npm run start
pnpm docs:check     # typecheck, lint, test, build – in docs/: npm run check
```

Every task: [`docs/README.md`](./docs/README.md#running-the-docs).

## More

- [`examples/`](./examples) – runnable, tested examples for every API, consuming the package via
  `npm link`. Every code snippet in the documentation is embedded from them.
- [CONTRIBUTING.md](./CONTRIBUTING.md) – scripts, CI, tests and the definition of done.
- [release.md](./release.md) – releasing, and how the docs follow major versions.

Maintained by [Hella Labs](https://hellalabs.dev/). [MIT](./LICENSE) licensed.
