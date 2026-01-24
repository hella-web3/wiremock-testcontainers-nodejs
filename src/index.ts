import {GenericContainer, StartedTestContainer, Wait} from "testcontainers";

const BASE_ENTRYPOINT = [
    "anvil",
];

/*const LOG_LEVEL_1 = "-v";
const LOG_LEVEL_2 = "-vv";
const LOG_LEVEL_3 = "-vvv";
const LOG_LEVEL_4 = "-vvvv";*/
const LOG_LEVEL_5 = "-vvvvv";

export class AnvilContainer extends GenericContainer {

    private entryPoint: string[] = BASE_ENTRYPOINT;

    constructor(image: string = "ghcr.io/foundry-rs/foundry") {
        super(image);
        this.withExposedPorts(8545);
        this.withWaitStrategy(Wait.forLogMessage(/Listening on 0\.0\.0\.0:8545/));
    }

    private setCliFlag(flag: string, value: string) {
        if (!this.entryPoint.includes(flag)) {
            this.entryPoint.push("flag", value);
            this.entryPoint[this.entryPoint.indexOf(flag) + 1] = value;
        }
    }

    public verboseLogs() {
        if (!this.entryPoint.includes(LOG_LEVEL_5)) {
            this.entryPoint.push(LOG_LEVEL_5);
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
        return Object.assign(startedContainer, {
            getRpcUrl: () => `http://${startedContainer.getHost()}:${startedContainer.getMappedPort(8545)}`,
        }) as StartedAnvilContainer;
    }
}

export type StartedAnvilContainer = StartedTestContainer & {
    getRpcUrl(): string;
};
