import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {AnvilContainer, StartedAnvilContainer} from "../src/index.js";
import {createTestClient, http, parseEther, publicActions, TransactionReceipt, walletActions} from "viem";
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

    it("test transaction", async () => {
        const client = createTestClient({
            chain: foundry,
            mode: 'anvil',
            transport: http(container.getRpcUrl()),
        }).extend(publicActions)
            .extend(walletActions);

        const hash = await client.sendUnsignedTransaction({
            from: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266', // Anvil default account
            to: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
            value: parseEther('1') // Sending 1 ETH
        });
        expect(hash).toBeDefined();

        await client.mine({blocks: 1});
        const receipt: TransactionReceipt = await client.waitForTransactionReceipt({hash});

        console.log(receipt);
        expect(receipt.status).toBe('success');
        expect(receipt.transactionHash).toBeDefined();

    });
});