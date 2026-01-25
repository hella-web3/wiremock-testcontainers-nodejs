import {AbstractStartedContainer, GenericContainer, StartedTestContainer, Wait} from "testcontainers";
import {createTestClient, http, parseEther, publicActions, walletActions} from "viem";
import {foundry} from "viem/chains";
import * as fs from "node:fs";
import path from "node:path";

const BASE_ENTRYPOINT = [
    "anvil",
    "--block-time",
    "1",
    "--auto-impersonate"
];

export enum LogVerbosity {
    One = "-v",
    Two = "-vv",
    Three = "-vvv",
    Four = "-vvvv",
    Five = "-vvvvv"
}

export class AnvilContainer extends GenericContainer {

    private entryPoint: string[] = BASE_ENTRYPOINT;

    constructor(image: string = "hellaweb3/foundry-anvil:1.6") {
        super(image);
        this.withExposedPorts(8545);
        this.withWaitStrategy(Wait.forLogMessage(/Listening on 0\.0\.0\.0:8545/));
    }

    private setCliFlag(flag: string, value: string) {
        if (!this.entryPoint.includes(flag)) {
            this.entryPoint.push(flag, value);
            this.entryPoint[this.entryPoint.indexOf(flag) + 1] = value;
        }
    }

    public withRandomMnemonic() {
        if (!this.entryPoint.includes('--mnemonic-random')) {
            this.entryPoint.push('--mnemonic-random');
        }
        return this;
    }

    public verboseLogs(logVerbosity: LogVerbosity) {
        if (!this.entryPoint.includes(logVerbosity)) {
            this.entryPoint.push(logVerbosity);
        }
        return this;
    }

    public jsonLogFormat() {
        if (!this.entryPoint.includes("--json")) {
            this.entryPoint.push("--json");
        }
        return this;
    }

    public withForkUrl(url: string): this {
        this.withEnvironment({ANVIL_FORK_URL: url});
        this.setCliFlag("--fork-url", url);
        return this;
    }

    public withForkBlockNumber(blockNumber: number): this {
        this.withEnvironment({ANVIL_FORK_BLOCK_NUMBER: blockNumber.toString()});
        this.setCliFlag("--fork-block-number", blockNumber.toString());
        return this;
    }

    public override async start(): Promise<StartedAnvilContainer> {
        this.entryPoint.push("--host", "0.0.0.0");
        this.withEntrypoint(this.entryPoint);

        const startedContainer = await super.start();
        return new StartedAnvilContainer(startedContainer,
            `http://${startedContainer.getHost()}:${startedContainer.getMappedPort(8545)}`);
    }
}

export  type AddressString = `0x${string}`;

export class StartedAnvilContainer extends AbstractStartedContainer {
    private readonly _rpcUrl;
    private readonly _client;

    constructor(startedTestContainer: StartedTestContainer, url: string) {
        super(startedTestContainer);
        this._rpcUrl = url;

        this._client = createTestClient({
            chain: foundry,
            mode: 'anvil',
            transport: http(url),
        }).extend(publicActions)
            .extend(walletActions);
    }

    get rpcUrl() {
        return this._rpcUrl;
    }

    get client() {
        return this._client;
    }

    addresses() {
        return this._client.getAddresses();
    }

    sendEthTransaction(from: AddressString, to: AddressString, amount: string) {
        return this._client.sendTransaction({
            account: from,
            from: from,
            to: to,
            value: parseEther(amount)
        });
    }

    async deployContract(abi, bytecode, account: AddressString) {
        const hash = await this._client.deployContract({
            abi: abi,
            bytecode: bytecode,
            account
        });
        await this._client.mine({blocks: 1});

        const receipt = await this._client.waitForTransactionReceipt({hash});
        console.log(`Contract deployed to: ${receipt.contractAddress}`);

        return receipt;
    }

    /**
     * Get local testing artifact contract ABI for deployment to anvil.
     * @example
     * ```typescript
     * contractAbi('WrappedEther/WrappedEther.json')
     * ```
     *
     * @param abiLocation location of the ABI file relative to the test/artifacts directory
     */
    contractAbi(abiLocation: string) {
        const abiJson = fs.readFileSync(path.join(__dirname, `../test/artifacts/${abiLocation}`), 'utf8');
        return JSON.parse(abiJson);
    }

    /**
     * Get local testing artifact contract bytecode for deployment to anvil.
     * @example
     * ```typescript
     * contractBytecode('WrappedEther/WrappedEther.bin')
     * ```
     *
     * @param binLocation location of the bytecode file relative to the test/artifacts directory
     */
    contractBytecode(binLocation: string) {
        return fs.readFileSync(path.join(__dirname, `../test/artifacts/${binLocation}`), 'utf8');
    }
}
