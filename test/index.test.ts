import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {AddressString, AnvilContainer, LogVerbosity, StartedAnvilContainer} from "../src/index.js";
import {TransactionReceipt} from "viem";


describe("AnvilContainer", () => {
    let container: StartedAnvilContainer;

    beforeAll(async () => {
        container = await new AnvilContainer()
            .verboseLogs(LogVerbosity.Five)
            .jsonLogFormat()
            .withRandomMnemonic()
            .start();
    }, 60000);

    afterAll(async () => {
        if (container) await container.stop();
    });

    it("should start and be reachable", async () => {

        const blockNumber = await container.client.getBlockNumber();
        expect(blockNumber).toBeDefined();
        expect(typeof blockNumber).toBe("bigint");
    });

    it("test send transaction", async () => {

        let addresses = await container.addresses();

        const hash: AddressString = await container.sendEthTransaction(addresses[0], addresses[1], "1");
        expect(hash).toBeDefined();

        await container.client.mine({blocks: 1});
        const receipt: TransactionReceipt = await container.client.waitForTransactionReceipt({hash});

        console.log(receipt);
        expect(receipt.status).toBe('success');
        expect(receipt.transactionHash).toBeDefined();
        expect(receipt.from).toBe(addresses[0].toLowerCase() as AddressString);
        expect(receipt.to).toBe(addresses[1].toLowerCase() as AddressString);
    });

    it("test deploy contract", async () => {

        let addresses = await container.addresses();

        const receipt: TransactionReceipt = await container.deployContract(
            container.contractAbi('WrappedEther/WrappedEther.json'),
            container.contractBytecode('WrappedEther/WrappedEther.bin'),
            addresses[0]);
        expect(receipt).toBeDefined();

        console.log(receipt);
    });
});