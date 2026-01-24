import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {AnvilContainer, StartedAnvilContainer} from "../src/index.js";
import {createTestClient, http, publicActions, walletActions} from "viem";
import {foundry} from "viem/chains";

describe("AnvilContainer", () => {
    let container: StartedAnvilContainer;

    beforeAll(async () => {
        container = await new AnvilContainer()
            .verboseLogs()
            .jsonLogFormat()
            .start();
    }, 60000);

    afterAll(async () => {
        if (container) await container.stop();
    });

    it("should start and be reachable", async () => {
        const client = createTestClient({
            chain: foundry,
            mode: 'anvil',
            transport: http(container.getRpcUrl()),
        }).extend(publicActions)
            .extend(walletActions);

        const blockNumber = await client.getBlockNumber();
        expect(blockNumber).toBeDefined();
        expect(typeof blockNumber).toBe("bigint");
    });
});
