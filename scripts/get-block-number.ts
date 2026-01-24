// Connect using viem
import {createTestClient, http, publicActions, walletActions} from "viem";
import {foundry} from "viem/chains";

const client = createTestClient({
    chain: foundry,
    mode: "anvil",
    transport: http("http://127.0.0.1:8545"),
}).extend(publicActions)
    .extend(walletActions);

const blockNumber = await client.getBlockNumber();
console.log(`Current block number: ${blockNumber}`);
const block = await client.getBlock({blockNumber});
console.log(block);

await client.mine({blocks: 1});

const waitForBlock = setInterval(async () => {
    console.log("Waiting for block to be mined...");

    if (await client.getBlockNumber() > blockNumber) {
        const blockNumberAfterMining = await client.getBlockNumber();
        console.log(`Current block number after mining: ${blockNumberAfterMining}`);
        const nextBlock = await client.getBlock({blockNumber: blockNumberAfterMining});
        console.log(nextBlock);

        clearInterval(waitForBlock);
    }
}, 1500);