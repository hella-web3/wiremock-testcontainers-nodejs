# Examples – end-user E2E quality gate

A standalone project consuming `@hellaweb3/wiremock-testcontainers-nodejs` through **`npm link`**,
exactly like an end user – proof that the *built* package works:

| Path                            | Shows                                                                        |
|---------------------------------|------------------------------------------------------------------------------|
| `e2e/user-flow.e2e.test.ts`     | The lifecycle: `waitUntilReady()`, `reset()`, `getUrl()`, `countRequests()`/`findRequests()` |
| `e2e/extensions.e2e.test.ts`    | The example extensions, each observed through real requests                 |
| `e2e/raw-extensions.e2e.test.ts`| Extensions without wrappers: a JAR, a class name, an object literal         |
| `extensions/`                   | Example TypeScript extensions, their unit tests (100 % coverage per file) and **[the guide for extension authors](./extensions/README.md)** |
| `__mocks__/extensions/*.jar`    | The compiled extensions (Java 11 bytecode), packed by the library's `pnpm build:extensions` |

## Run

From the repository root, in one command:

```bash
pnpm examples:e2e   # build, npm link, install, link, typecheck, test
pnpm examples:unit  # the same, unit tests only, with coverage – no container
```

Or step by step:

```bash
pnpm build && npm link                  # repository root: build and register the package
cd examples && npm install              # then link it – `npm install` removes links,
npm run link:library                    # so always link afterwards
npm run typecheck && npm test           # or: test:unit / test:e2e
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

| File                     | Role                                                                      |
|--------------------------|---------------------------------------------------------------------------|
| `scripts/test-e2e.mjs`   | `--no-docker` → `WIREMOCK_NO_DOCKER=1`, prints a warning, refuses in CI/CD |
| `vitest.config.ts`       | Adds the setup file only when `WIREMOCK_NO_DOCKER=1`                      |
| `e2e/no-docker.setup.ts` | Calls `installNoDockerRuntime()` from `…/no-docker`                       |
| `package.json`           | `wiremock` dev dependency – the standalone JAR                            |

> [!WARNING]
> Never for CI/CD – the wrapper and the harness both refuse to run there. A green `--no-docker`
> run is a fast local signal, not a substitute for the Docker run.
