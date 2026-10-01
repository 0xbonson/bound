import {
  readFile,
} from "node:fs/promises";

import {
  createPublicClient,
  formatEther,
  http,
} from "viem";

import {
  bscTestnet,
} from "viem/chains";

import {
  privateKeyToAccount,
} from "viem/accounts";

const PRIVATE_KEY_PATH =
  ".bound/agent/private-key";

const RPC_URL =
  process.env.BSC_TESTNET_RPC ??
  "https://data-seed-prebsc-1-s1.bnbchain.org:8545/";

async function loadPrivateKey():
Promise<`0x${string}`> {
  const value =
    (
      await readFile(
        PRIVATE_KEY_PATH,
        "utf8"
      )
    ).trim();

  if (
    !/^0x[0-9a-fA-F]{64}$/.test(
      value
    )
  ) {
    throw new Error(
      "Agent private key file is malformed."
    );
  }

  return value as `0x${string}`;
}

async function main() {
  const privateKey =
    await loadPrivateKey();

  const account =
    privateKeyToAccount(
      privateKey
    );

  const client =
    createPublicClient({
      chain:
        bscTestnet,

      transport:
        http(
          RPC_URL
        ),
    });

  const balance =
    await client.getBalance({
      address:
        account.address,
    });

  console.log(
    "\n=== BOUND AGENT WALLET ==="
  );

  console.log(
    `Address: ${account.address}`
  );

  console.log(
    "Network: BNB Smart Chain Testnet"
  );

  console.log(
    `Chain ID: ${bscTestnet.id}`
  );

  console.log(
    "\n=== ONCHAIN BALANCE ==="
  );

  console.log(
    `tBNB: ${formatEther(
      balance
    )}`
  );

  console.log(
    "\n=== READINESS ==="
  );

  if (
    balance > 0n
  ) {
    console.log(
      "GAS + NATIVE PAYMENT: READY"
    );

    console.log(
      "\nBOUND agent wallet is ready for native tBNB testnet execution."
    );
  } else {
    console.log(
      "NOT READY — agent wallet needs testnet tBNB."
    );

    console.log(
      "\nDo not enable real signing yet."
    );
  }
}

await main();
