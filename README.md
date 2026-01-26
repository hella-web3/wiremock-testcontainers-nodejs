<!--suppress HtmlDeprecatedAttribute -->
<div align="center">

<h1>Foundry Anvil Testcontainers NodeJS Module</h1>

<a href="https://github.com/hella-web3/foundryanvil-testcontainers-nodejs/actions/workflows/main.yml">
    <img alt="Build+Test Status" src="https://github.com/hella-web3/foundryanvil-testcontainers-nodejs/actions/workflows/main.yml/badge.svg">
</a>

</div>

## Description

This repository provides a [Testcontainers](https://testcontainers.com/) module
for Node.js to run a customized
Anvil node in your E2E tests.

This Typescript module provides a Fluent API style method of configuring and
starting the Anvil node. And during your
test execution, the module provides
a [viem test client](https://viem.sh/docs/clients/test) and
streamlined helper methods to interact with the node.

**Base image:** https://github.com/foundry-rs/foundry/blob/master/Dockerfile

**Built using Anvil:** https://getfoundry.sh/anvil/reference/anvil

**Foundry image:** `ghcr.io/foundry-rs/foundry:v1.6.0-rc1`

**Custom image:** `hellaweb3/foundry-anvil:1.6`

[Custom image DockerHub](https://hub.docker.com/repository/docker/hellaweb3/0.1-eth-anvil/general)

---

## Usage

Install the module:

```shell
pnpm add -D @hellaweb3/foundryanvil-testcontainers-nodejs
```

### Setup

Use the `AnvilContainer` module to start up a new Anvil testcontainer in your
test suite.

- Set up the container in a `beforeAll` hook.
- Add an `afterAll` hook to stop the container.

```ts
describe("AnvilContainer", () => {
  let container: StartedAnvilContainer;

  beforeAll(async () => {
    container = await new AnvilContainer()
      .verboseLogs(LogVerbosity.Five)
      .jsonLogFormat()
      .withRandomMnemonic()
      .autoImpersonate()
      .start();
  }, 60000);

  afterAll(async () => {
    if (container) await container.stop();
  });
});
```

### Test

The `StartedAnvilContainer` provides a viem test client that you can use to
interact with the node.

- Access the viem test client via `container.client`.
- Use container test helpers like `addresses()` and `sendEthTransaction()`.

```ts
it("test send transaction", async () => {
  let addresses = await container.addresses();

  const receipt: TransactionReceipt = await container.sendEthTransaction(
    addresses[0],
    addresses[1],
    "1",
  );

  expect(receipt.status).toBe("success");
});
```

---

## Scripts

| Script                  | Description                       |
|-------------------------|-----------------------------------|
| `pnpm run dev`          | Start development mode with watch |
| `pnpm run build`        | Build for production              |
| `pnpm run test`         | Run tests                         |
| `pnpm run test:watch`   | Run tests in watch mode           |
| `pnpm run lint`         | Lint code                         |
| `pnpm run format`       | Format code                       |
| `pnpm run format:check` | Check if code is formatted        |
| `pnpm run typecheck`    | Run TypeScript type checking      |

---

### Forking

Configure the Anvil node to fork from a remote RPC URL:

```ts
const container = await new AnvilContainer()
  .withForkUrl(`https://mainnet.infura.io/v3/${INFURA_KEY}`)
  .withForkBlockNumber(17500000)
  .start();
```

---

## Tools

TSDX wraps these modern, high-performance tools:

- **[Bunchee](https://github.com/huozhi/bunchee)** - Zero-config bundler for npm
  packages
- **[Vitest](https://vitest.dev/)** - Next-generation testing framework

## Module Formats

This library exports both ESM and CommonJS formats, with full TypeScript
support:

- `dist/index.js` - ESM
- `dist/index.cjs` - CommonJS
- `dist/index.d.ts` - TypeScript declarations

## Publishing

```bash
# Build the package
pnpm run build

# Publish to npm
npm publish
```

We recommend using [np](https://github.com/sindresorhus/np) for publishing.

---

## Contracts

WETH: https://etherscan.io/address/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2#code

---

### Using a Custom Docker Image

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

## License

MIT
