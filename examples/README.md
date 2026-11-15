# Examples

Runnable, tested examples of every API of `@hellaweb3/wiremock-testcontainers-nodejs`, organised
by task. A standalone project consuming the package through **`npm link`**, exactly like an end
user – proof that the *built* package works.

They are the single source of every code snippet in the
**[documentation](https://hella-web3.github.io/wiremock-testcontainers-nodejs/)**: pages embed
regions of these files at build time, and each file links back to its page with an `@see` comment.
So the examples are held to the same standard as library code – type-checked, linted,
unit-tested with 100 % coverage per module, and run end-to-end against WireMock in CI.

| Folder | Task | Docs |
|--------|------|------|
| [`app/`](./app) | The code under test: a `fetch`-based payments client | [Verifying requests](https://hella-web3.github.io/wiremock-testcontainers-nodejs/docs/guides/verifying-requests) |
| [`getting-started/`](./getting-started) | The quick start; ES modules and CommonJS | [Quick start](https://hella-web3.github.io/wiremock-testcontainers-nodejs/docs/getting-started/quick-start), [installation](https://hella-web3.github.io/wiremock-testcontainers-nodejs/docs/getting-started/installation) |
| [`stubs/`](./stubs) | `withMappings()`, `withMapping()`, `withFiles()`; every file source | [Registering stubs](https://hella-web3.github.io/wiremock-testcontainers-nodejs/docs/guides/registering-stubs), [file sources](https://hella-web3.github.io/wiremock-testcontainers-nodejs/docs/guides/file-sources) |
| [`container/`](./container) | The image, `withCommand()`, `WIREMOCK_OPTIONS`, Testcontainers methods | [Configuring the container](https://hella-web3.github.io/wiremock-testcontainers-nodejs/docs/guides/configuring-the-container) |
| [`lifecycle/`](./lifecycle) | `start()`, `waitUntilReady()`, URLs, `isRunning()`, `await using` | [Container lifecycle](https://hella-web3.github.io/wiremock-testcontainers-nodejs/docs/guides/container-lifecycle) |
| [`isolation/`](./isolation) | `reset()`, `resetRequests()`, scenarios, runtime stubs | [Test isolation](https://hella-web3.github.io/wiremock-testcontainers-nodejs/docs/guides/test-isolation) |
| [`verification/`](./verification) | `countRequests()`, `findRequests()`, request criteria | [Verifying requests](https://hella-web3.github.io/wiremock-testcontainers-nodejs/docs/guides/verifying-requests) |
| [`extensions/`](./extensions) | JARs, class names, TypeScript extensions, extension options | [Java extensions](https://hella-web3.github.io/wiremock-testcontainers-nodejs/docs/extensions/java-extensions), [TypeScript extensions](https://hella-web3.github.io/wiremock-testcontainers-nodejs/docs/extensions/typescript-extensions), [authoring](https://hella-web3.github.io/wiremock-testcontainers-nodejs/docs/extensions/authoring-extensions) |
| [`no-docker/`](./no-docker) | `installNoDockerRuntime()`, `detectCI()`, `isNoDockerRequested()` | [Running without Docker](https://hella-web3.github.io/wiremock-testcontainers-nodejs/docs/guides/running-without-docker) |
| [`troubleshooting/`](./troubleshooting) | Every error, triggered | [Troubleshooting](https://hella-web3.github.io/wiremock-testcontainers-nodejs/docs/reference/troubleshooting) |

Each folder pairs a module with its tests: `*.test.ts` are unit tests – no container – and
`*.e2e.test.ts` run against WireMock. Shared fixtures: [`__mocks__/`](./__mocks__) – recorded
stubs and the compiled extension JARs (packed by the library's `pnpm build:extensions`) – and
[`packages/payments-stubs`](./packages/payments-stubs), stubs shared as an npm package.

## Run

From the repository root, in one command:

```bash
pnpm examples:e2e   # build, npm link, install, link, typecheck, lint, test
pnpm examples:unit  # the same, unit tests only, with coverage – no container
```

Or step by step:

```bash
pnpm build && npm link                  # repository root: build and register the package
cd examples && npm install              # then link it – `npm install` removes links,
npm run link:library                    # so always link afterwards
npm run typecheck && npm run lint       # static checks
npm run test:unit                       # unit tests, 100 % coverage per module
npm run test:e2e                        # E2E tests – Docker
npm test                                # both
```

Needs Node.js >= 22 and a [container runtime](https://node.testcontainers.org/supported-container-runtimes/).
The library is deliberately absent from `package.json`: the link resolves it to the current build.

## Without Docker (local development only)

With Java 11+, run the same flow against a local WireMock JVM:

```bash
npm test --no-docker            # or: npm test -- --no-docker
pnpm examples:e2e --no-docker   # from the repository root
```

The wiring to copy into your own project:

| File                          | Role                                                                       |
|-------------------------------|----------------------------------------------------------------------------|
| `scripts/test-e2e.mjs`        | `--no-docker` → `WIREMOCK_NO_DOCKER=1`, prints a warning, refuses in CI/CD |
| `vitest.config.ts`            | Adds the setup file only when `isNoDockerRequested()`                      |
| `no-docker/no-docker.setup.ts`| Calls `installNoDockerRuntime()` from `…/no-docker`                        |
| `package.json`                | `wiremock` dev dependency – the standalone JAR                             |

> [!WARNING]
> Never for CI/CD – the wrapper and the harness both refuse to run there. A green `--no-docker`
> run is a fast local signal, not a substitute for the Docker run.

## Adding an example

1. Put it in the folder of its task: a module, its unit test, and an E2E test if it talks to
   WireMock. Name the page it belongs to in a header comment: `@see https://hella-web3.github.io/wiremock-testcontainers-nodejs/docs/<page>`.
2. Mark what the docs show with `// #region name` … `// #endregion name` and embed it in that page
   with ```` ```ts file=<folder>/<file>.ts#name ````.
3. Run `pnpm examples:unit`, `pnpm examples:e2e` and `pnpm docs:check` – the docs' tests check
   that every region is shown and every file is linked. Preview the page with `pnpm docs:start`
   (see [running the docs](../docs/README.md#running-the-docs)).
