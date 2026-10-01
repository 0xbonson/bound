import {
  readFile,
} from "node:fs/promises";

import {
  createPublicClient,
  formatEther,
  formatUnits,
  http,
  parseAbi,
} from "viem";

import {
  bscTestnet,
} from "viem/chains";

import {
  privateKeyToAccount,
} from "viem/accounts";

const PRIVATE_KEY_PATH =
  ".bound/agent/private-key";

/*
 * Existing ERC-20 test token already deployed
 * on BNB Smart Chain Testnet.
 *
 * We are reusing it only as a test asset so we
 * can prove BOUND's real signing/execution flow
 * without wasting time deploying another token.
 *
 * It is NOT part of BOUND's product architecture.
 */
const TEST_TOKEN =
  "0x0ed5e77b023eb522EB10313CA2dc6A3aB50f28b6" as const;

const RPC_URL =
  process.env.BSC_TESTNET_RPC ??
  "https://data-seed-prebsc-1-s1.bnbchain.org:8545/";

const erc20Abi =
  parseAbi([
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address owner) view returns (uint256)",
  ]);

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

  const [
    nativeBalance,
    symbol,
    decimals,
    tokenBalance,
  ] =
    await Promise.all([
      client.getBalance({
        address:
          account.address,
      }),

      client.readContract({
        address:
          TEST_TOKEN,

        abi:
          erc20Abi,

        functionName:
          "symbol",
      }),

      client.readContract({
        address:
          TEST_TOKEN,

        abi:
          erc20Abi,

        functionName:
          "decimals",
      }),

      client.readContract({
        address:
          TEST_TOKEN,

        abi:
          erc20Abi,

        functionName:
          "balanceOf",

        args: [
          account.address,
        ],
      }),
    ]);

  console.log(
    "\n=== ONCHAIN BALANCES ==="
  );

  console.log(
    `tBNB: ${formatEther(
      nativeBalance
    )}`
  );

  console.log(
    `${symbol}: ${formatUnits(
      tokenBalance,
      decimals
    )}`
  );

  console.log(
    `Token decimals: ${decimals}`
  );

  console.log(
    `Token contract: ${TEST_TOKEN}`
  );

  console.log(
    "\n=== READINESS ==="
  );

  if (
    nativeBalance === 0n
  ) {
    console.log(
      "GAS: NOT READY — agent wallet needs a small amount of testnet tBNB."
    );
  } else {
    console.log(
      "GAS: READY"
    );
  }

  if (
    tokenBalance === 0n
  ) {
    console.log(
      `TOKEN: NOT READY — agent wallet needs some ${symbol}.`
    );
  } else {
    console.log(
      "TOKEN: READY"
    );
  }

  if (
    nativeBalance > 0n &&
    tokenBalance > 0n
  ) {
    console.log(
      "\nBOUND agent wallet is ready for a real testnet transfer."
    );
  } else {
    console.log(
      "\nDo not enable signing yet."
    );
  }
}

await main();
