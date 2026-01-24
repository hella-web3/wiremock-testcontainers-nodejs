# Anvil Testcontainers Module Node.js

## Testcontainers Module

This repository also provides a [Testcontainers](https://testcontainers.com/) module for Node.js to run a customized
Anvil node in
your E2E tests.

**Base image:** https://github.com/foundry-rs/foundry/blob/master/Dockerfile

**Built using Anvil:** https://getfoundry.sh/anvil/reference/anvil

**Testcontainer image:** https://hub.docker.com/repository/docker/hellaweb3/0.1-eth-anvil/general

**Current image:** `hellaweb3/foundry-anvil:1.6`

----

### Local Testing

**Build the docker image:**

```shell
docker build -t hellaweb3/foundry-anvil:1.6 .
```

**Run the docker image:**

```shell
docker run -p 8545:8545 hellaweb3/foundry-anvil:1.6
```

**Push the docker image:**

```shell
docker push hellaweb3/foundry-anvil:1.6
```

**Use cast to test the connection:**

```shell
cast block-number
```

**Use script to test the connection:**

```shell
node ./scripts/get-block-number.ts
```

----

## Quick Start

```bash
# Install dependencies
bun install

# Start development mode
bun run dev

# Build for production
bun run build

# Run tests
bun run test

# Lint code
bun run lint

# Format code
bun run format
```

----

## Scripts

| Script                 | Description                       |
|------------------------|-----------------------------------|
| `bun run dev`          | Start development mode with watch |
| `bun run build`        | Build for production              |
| `bun run test`         | Run tests                         |
| `bun run test:watch`   | Run tests in watch mode           |
| `bun run lint`         | Lint code                         |
| `bun run format`       | Format code                       |
| `bun run format:check` | Check if code is formatted        |
| `bun run typecheck`    | Run TypeScript type checking      |

----

### Forking

Configure the Anvil node to fork from a remote RPC URL:

```ts
const container = await new AnvilContainer()
    .withForkUrl("https://eth-mainnet.g.alchemy.com/v2/your-api-key")
    .withForkBlockNumber(17500000)
    .start();
```

----

## Tools

TSDX wraps these modern, high-performance tools:

- **[Bunchee](https://github.com/huozhi/bunchee)** - Zero-config bundler for npm packages
- **[Vitest](https://vitest.dev/)** - Next-generation testing framework
- **[Oxlint](https://oxc.rs/docs/guide/usage/linter.html)** - Rust-powered linter (50-100x faster than ESLint)
- **[Oxfmt](https://oxc.rs/docs/guide/usage/formatter)** - Rust-powered formatter (35x faster than Prettier)
- **[TypeScript](https://www.typescriptlang.org/)** - Type safety

## Module Formats

This library exports both ESM and CommonJS formats, with full TypeScript support:

- `dist/index.js` - ESM
- `dist/index.cjs` - CommonJS
- `dist/index.d.ts` - TypeScript declarations

## Publishing

```bash
# Build the package
bun run build

# Publish to npm
npm publish
```

We recommend using [np](https://github.com/sindresorhus/np) for publishing.

----

### Supported environment variables

- `ANVIL_FORK_URL` - An RPC URL to use for forking. If this is not provided, the Anvil node will not fork.
- `ANVIL_FORK_BLOCK_NUMBER` - The block number to fork from. If this is not provided, the Anvil node will fork from the
  latest block.

### Details

- The `--host` CLI flag is hard-coded to `0.0.0.0` This is required for Docker networking to work as expected.
- You can run this image locally, e.g.
  `docker run -p 8545:8545 -e ANVIL_FORK_URL=https://eth-mainnet.g.alchemy.com/v2/... simple-anvil-image` and it should
  serve requests at `http://localhost:8545`.
- Rather than passing CLI flags to configure settings like the fork block number and automining behavior, you can
  configure these values after the service has already started using the `anvil_` RPC methods.
- The viem [Test Client](https://viem.sh/docs/clients/test.html) makes this very easy.

## Sample GitHub Action workflow

- The service will be available at `http://localhost:8545` in any workflow steps that run directly on the runner (like
  `pnpm bench` shown below).
- The service will be available at `http://anvil:8545` in any other services (such as the `graph-node` service shown
  below).

```yaml
name: Bench

jobs:
  bench:
    name: Bench
    runs-on: ubuntu-latest
    services:
      anvil:
        image: ghcr.io/0xolias/simple-anvil-image:main
        env:
          ANVIL_FORK_URL: ${{ secrets.ANVIL_FORK_URL }}
          # If omitted, the Anvil node will fork from the latest block.
          ANVIL_FORK_BLOCK_NUMBER: 17500000
        ports:
          - 8545:8545
      graph-node:
        image: graphprotocol/graph-node
        env:
          # The Graph node can send requests to the Anvil node at http://anvil:8545.
          ethereum: mainnet:http://anvil:8545
        ports:
          - 8000:8000
    steps:
      - name: Clone repository
        uses: actions/checkout@v3

      # The Anvil node will now be available at http://localhost:8545 in your workflow steps.
      - name: Bench
        run: pnpm bench


```

## Control using a `viem` Test Client

This code would run as expected in the `pnpm bench` step of the workflow above.

```ts
import {type Chain, createTestClient, http} from "viem";
import {mainnet} from "viem/chains";

const anvil = {
    ...mainnet, // We are using a mainnet fork for testing.
    id: 1,
    rpcUrls: {
        default: {
            http: [`http://127.0.0.1:8545`],
            webSocket: [`ws://127.0.0.1:8545`],
        },
        public: {
            http: [`http://127.0.0.1:8545`],
            webSocket: [`ws://127.0.0.1:8545`],
        },
    },
} as Chain;

const testClient = createTestClient({
    chain: anvil,
    mode: "anvil",
    transport: http(),
});

async function resetAnvil() {
    await testClient.setAutomine(false);
    await testClient.setRpcUrl("https://quiknode.pro/...");
    await testClient.reset({blockNumber: 16_000_000n});
}
```

## License

MIT
