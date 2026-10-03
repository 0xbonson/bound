import {
    readFile,
} from "node:fs/promises";

import {
    createPublicClient,
    formatEther,
    formatUnits,
    getAddress,
    http,
    parseAbi,
    type Hex,
} from "viem";

import {
    privateKeyToAccount,
} from "viem/accounts";

import {
    bscTestnet,
} from "viem/chains";

/*
 * =======================================================
 * BOUND — REAL MPP PAYER CHECK
 * =======================================================
 *
 * This script reads the existing protected BOUND agent
 * wallet key locally.
 *
 * It NEVER prints the private key.
 *
 * It verifies, using live BSC Testnet RPC:
 *
 * - chain ID
 * - latest block
 * - payer address
 * - payer tBNB balance
 * - TEST_USDT contract metadata
 * - payer TEST_USDT balance
 * - whether the payer can fund one 0.001 TEST_USDT request
 */

const RPC_URL =
    process.env.BOUND_BSC_TESTNET_RPC ??
    "https://bsc-testnet-dataseed.bnbchain.org";

const PRIVATE_KEY_PATH =
    process.env.BOUND_AGENT_PRIVATE_KEY_PATH ??
    ".bound/agent/private-key";

const TEST_USDT =
    getAddress(
        "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd"
    );

/*
 * 0.001 TEST_USDT with 18 decimals.
 */
const REQUIRED_PAYMENT_RAW =
    1_000_000_000_000_000n;

const erc20Abi =
    parseAbi([
        "function balanceOf(address account) view returns (uint256)",
        "function decimals() view returns (uint8)",
        "function symbol() view returns (string)",
        "function name() view returns (string)",
    ]);

function parsePrivateKey(
    value: string
): Hex {
    const trimmed =
        value.trim();

    if (
        !/^0x[0-9a-fA-F]{64}$/.test(
            trimmed
        )
    ) {
        throw new Error(
            `Invalid private key format in ${PRIVATE_KEY_PATH}.`
        );
    }

    return trimmed as Hex;
}

const privateKeyText =
    await readFile(
        PRIVATE_KEY_PATH,
        "utf8"
    );

const account =
    privateKeyToAccount(
        parsePrivateKey(
            privateKeyText
        )
    );

/*
 * Do not print privateKeyText.
 */
const publicClient =
    createPublicClient({
        chain:
            bscTestnet,

        transport:
            http(
                RPC_URL
            ),
    });

const chainId =
    await publicClient
        .getChainId();

if (
    chainId !==
    97
) {
    throw new Error(
        `Wrong chain. RPC returned chainId=${chainId}; expected 97.`
    );
}

const blockNumber =
    await publicClient
        .getBlockNumber();

const nativeBalance =
    await publicClient
        .getBalance({
            address:
                account.address,
        });

const tokenName =
    await publicClient
        .readContract({
            address:
                TEST_USDT,

            abi:
                erc20Abi,

            functionName:
                "name",
        });

const tokenSymbol =
    await publicClient
        .readContract({
            address:
                TEST_USDT,

            abi:
                erc20Abi,

            functionName:
                "symbol",
        });

const tokenDecimals =
    await publicClient
        .readContract({
            address:
                TEST_USDT,

            abi:
                erc20Abi,

            functionName:
                "decimals",
        });

const tokenBalance =
    await publicClient
        .readContract({
            address:
                TEST_USDT,

            abi:
                erc20Abi,

            functionName:
                "balanceOf",

            args: [
                account.address,
            ],
        });

const hasGas =
    nativeBalance >
    0n;

const enoughToken =
    tokenBalance >=
    REQUIRED_PAYMENT_RAW;

console.log(
    ""
);

console.log(
    "BOUND MPP PAYER CHECK"
);

console.log(
    ""
);

console.log(
    `Network: BNB Smart Chain Testnet`
);

console.log(
    `Chain ID: ${chainId}`
);

console.log(
    `Latest block: ${blockNumber}`
);

console.log(
    `RPC: ${RPC_URL}`
);

console.log(
    ""
);

console.log(
    "PAYER"
);

console.log(
    `Address: ${account.address}`
);

console.log(
    `Private key printed: false`
);

console.log(
    ""
);

console.log(
    "GAS"
);

console.log(
    `tBNB balance: ${formatEther(
        nativeBalance
    )}`
);

console.log(
    `Has gas: ${hasGas}`
);

console.log(
    ""
);

console.log(
    "MPP PAYMENT TOKEN"
);

console.log(
    `Contract: ${TEST_USDT}`
);

console.log(
    `Onchain name: ${tokenName}`
);

console.log(
    `Onchain symbol: ${tokenSymbol}`
);

console.log(
    `Onchain decimals: ${tokenDecimals}`
);

console.log(
    `Balance: ${formatUnits(
        tokenBalance,
        tokenDecimals
    )} ${tokenSymbol}`
);

console.log(
    `Required per request: ${formatUnits(
        REQUIRED_PAYMENT_RAW,
        tokenDecimals
    )} ${tokenSymbol}`
);

console.log(
    `Enough token: ${enoughToken}`
);

console.log(
    ""
);

if (
    hasGas &&
    enoughToken
) {
    console.log(
        "STATUS: READY_FOR_REAL_MPP_PAYMENT"
    );
} else {
    console.log(
        "STATUS: FUNDING_REQUIRED"
    );

    if (
        !hasGas
    ) {
        console.log(
            "- Missing tBNB for transaction gas."
        );
    }

    if (
        !enoughToken
    ) {
        console.log(
            "- Missing TEST_USDT required by the real MPP challenge."
        );
    }

    process.exitCode =
        2;
}