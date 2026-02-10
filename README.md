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
containers, including support for loading mappings and files from recorded
Wiremock sessions.

## Installation

```bash
pnpm add -D @hellaweb3/wiremock-testcontainers-nodejs testcontainers
```

## Usage

### Basic Example

Assuming you placed your mappings in `test/__mocks__/wiremock`,

```typescript
import { WiremockContainer } from "@hellaweb3/wiremock-testcontainers-nodejs";

describe("E2E Test", () => {
  let container;

  beforeAll(async () => {
    container = await new WiremockContainer()
      .withMappings("./test/__mocks__/wiremock")
      .start();
  }, 60000);

  afterAll(async () => {
    await container.stop();
  });

  it("should interact with WireMock", async () => {
    const url = container.rpcUrl;
    // Your test logic here
  });
});
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

## API

### `WiremockContainer`

- `constructor(image?: string)`: Create a new container. Defaults to
  `wiremock/wiremock`.
- `withMappings(directory: string)`: Mounts `mappings` and `__files` from the
  specified local directory to the container.
- `start()`: Starts the container and returns a `StartedWiremockContainer`.

### `StartedWiremockContainer`

- `rpcUrl`: Returns the base URL of the running WireMock instance (e.g.,
  `http://localhost:32768`).
- `stop()`: Stops the container (inherited from Testcontainers).

## Best Practices

1. **Test Isolation**: Start a new container for each test suite (or even each
   test if performance allows) to ensure a clean state.
2. **Mapping Organization**: Keep your mappings organized in a dedicated
   directory structure that mirrors your API endpoints.
3. **Timeouts**: Docker container startup can sometimes exceed the default test
   runner timeout (e.g., 5s in Jest). Always set a higher timeout for
   `beforeAll` hooks that start containers.
4. **Resource Management**: Always ensure `container.stop()` is called in an
   `afterAll` or `afterEach` block to prevent orphaned containers.

## Maintainers

Maintained by [Hella Labs](https://hellaweb3.com/).

## License

MIT
