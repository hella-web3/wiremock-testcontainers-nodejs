# Contributing

Tooling: [Vitest](https://vitest.dev/), [oxlint](https://oxc.rs/docs/guide/usage/linter), `tsc` and
[tsdown](https://tsdown.dev/). Node version: `.nvmrc`.

## Scripts

| Command                        | What it does                                                        | Needs    |
|--------------------------------|---------------------------------------------------------------------|----------|
| `pnpm build`                   | One barrel per format (ESM, CJS, declarations) into `dist/`, checked by publint and attw | – |
| `pnpm typecheck`               | `tsc --noEmit` over `src/` and `test/`                              | –        |
| `pnpm lint`                    | `oxlint --deny-warnings`                                            | –        |
| `pnpm test:unit`               | `test/unit/**` – 100 % of `src/`                                    | –        |
| `pnpm test:e2e`                | `test/index.test.ts` against a WireMock container                   | Docker   |
| `pnpm test:e2e --no-docker`    | The same against a local WireMock JVM – local only, refused in CI   | Java 11+ |
| `pnpm test`, `pnpm test:coverage` | Both suites; the latter enforces 95 % coverage                   | Docker   |
| `pnpm check`                   | `build`, `typecheck`, `lint` and `test:coverage` in one go          | Docker   |
| `pnpm examples:setup`          | Build, `npm link`, and install and link [`examples/`](./examples)   | –        |
| `pnpm examples:unit`           | `examples:setup`, then typecheck and unit-test `examples/` (100 % coverage per file) | – |
| `pnpm examples:e2e`            | `examples:setup`, then typecheck and test `examples/` (accepts `--no-docker`) | Docker |
| `pnpm build:extensions`        | Pack the fixture extension JARs from their compiled classes (`--check`: verify only) | – |

## Without Docker

`pnpm test:e2e --no-docker` (or `npm run test:e2e --no-docker`) runs the E2E suite against a
local WireMock JVM: it warns, sets `WIREMOCK_NO_DOCKER=1` for that run only and refuses to run in
CI/CD. Treat a green run as a fast local signal, not E2E sign-off. To get a container runtime:

| Environment                    | How                                                                          |
|--------------------------------|------------------------------------------------------------------------------|
| Codespaces / Dev Containers    | `.devcontainer/devcontainer.json` adds `docker-in-docker`                    |
| Host socket in a dev container | Mount `/var/run/docker.sock`; set `TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal` if port lookups fail |
| Remote or rootless daemon      | `DOCKER_HOST=tcp://host:2375` or `unix:///path/to/docker.sock`               |
| Podman                         | `DOCKER_HOST=unix://$XDG_RUNTIME_DIR/podman/podman.sock`, `TESTCONTAINERS_RYUK_DISABLED=true` |
| Locked-down machine            | [Testcontainers Cloud](https://testcontainers.com/cloud/) (`TC_CLOUD_TOKEN`) |

## CI

- `main.yml` – build, typecheck, lint, unit tests with coverage and E2E tests on Node 22 and 24,
  plus [`examples/`](./examples) through `npm link`: unit tests, then E2E. Never `--no-docker`.
- `size.yml` – fails a PR whose tarball exceeds `MAX_TARBALL_KB`. Only `dist/`, `README.md`,
  `LICENSE` and `package.json` are published. The `.cjs` and `.js` twins sit beyond gzip's 32 KB
  window of each other, so each compresses in full – a byte saved in `src/` saves two.
- Supply chain: frozen lockfile; install scripts allow-listed and `minimumReleaseAge: 1440` in
  `pnpm-workspace.yaml`; a non-blocking `pnpm audit --prod`; weekly Dependabot updates with a
  3-day cooldown.

## Releasing

1. Bump the version, tag and push, e.g. `npx np --no-publish` or
   `pnpm version patch && git push --follow-tags`.
2. The `v*` tag runs `release.yml`, which creates the GitHub release.
3. Run `publish.yml` (Actions → *Publish to NPM*): it verifies, builds and publishes with npm
   provenance.

## Tests and fixtures

- `test/__mocks__/wiremock` – a recorded session plus negative cases: `GET /cards?page=0` → 400,
  and `GET /account/balance` → 500 with `X-Mock-Scenario: server-error` (`"priority": 1`).
- `test/helpers/assertions.ts` – a `Schema<T>` per payload; the compiler requires every field to
  be asserted.
- `test/__mocks__/extensions/<jar>/classes` – compiled WireMock extensions (Java 11 bytecode; no
  Java source, no JDK), described in its README. After changing them, run `pnpm build:extensions`.
  `fixtures.test.ts` fails on an out-of-date JAR or `examples/` copy, newer bytecode, or a `.java` file.
- `test/helpers/container.ts` – reads the archive Testcontainers would upload, so registration
  tests need no Docker.
- `test/unit/*.test.ts` stub only what talks to the outside: `fetch`, `spawn` (a fake JVM) or
  `GenericContainer.start`.
