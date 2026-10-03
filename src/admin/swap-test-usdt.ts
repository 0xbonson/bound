import {
    readFile,
} from "node:fs/promises";

import {
    createPublicClient,
    createWalletClient,
    formatEther,
    formatUnits,
    getAddress,
    http,
    parseAbi,
    parseEther,
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
 * BOUND — TESTNET tBNB -> TEST_USDT SWAP
 * =======================================================
 *
 * Purpose:
 *
 * Acquire the exact BSC Testnet TEST_USDT required by
 * the real BNB MPP challenge.
 *
 * Safety properties:
 *
 * - Uses the existing local protected agent wallet.
 * - Never prints the private key.
 * - Reads a fresh PancakeSwap quote before execution.
 * - Verifies the exact token contract.
 * - Uses a non-zero minimum output.
 * - Simulates the exact swap before broadcast.
 * - Defaults to PREVIEW ONLY.
 * - Broadcast happens only when:
 *
 *     BOUND_EXECUTE_SWAP=YES
 *
 * This is BSC TESTNET only.
 */

const RPC_URL =
    process.env.BOUND_BSC_TESTNET_RPC ??
    "https://bsc-testnet-dataseed.bnbchain.org";

const PRIVATE_KEY_PATH =
    process.env.BOUND_AGENT_PRIVATE_KEY_PATH ??
    ".bound/agent/private-key";

/*
 * PancakeSwap V2 BSC Testnet contracts.
 */
const ROUTER =
    getAddress(
        "0xD99D1c33F9fC3444f8101754aBC46c52416550D1"
    );

const WBNB =
    getAddress(
        "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd"
    );

/*
 * Exact TEST_USDT required by the BNB MPP challenge.
 */
const TEST_USDT =
    getAddress(
        "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd"
    );

/*
 * Keep the acquisition small.
 *
 * The previous live route check showed that 0.01 tBNB
 * quoted substantially more than the 0.001 USDT required
 * for one MPP payment.
 *
 * We therefore preview only 0.001 tBNB by default and
 * obtain a fresh quote before doing anything.
 */
const INPUT_TBNB =
    process.env.BOUND_SWAP_INPUT_TBNB ??
    "0.001";

/*
 * Default maximum quote slippage:
 *
 * 500 basis points = 5%.
 *
 * The swap will revert rather than accept output below
 * amountOutMin.
 */
const SLIPPAGE_BPS =
    Number(
        process.env.BOUND_SWAP_SLIPPAGE_BPS ??
        "500"
    );

const EXECUTE =
    process.env.BOUND_EXECUTE_SWAP ===
    "YES";

/*
 * 0.001 TEST_USDT, 18 decimals.
 *
 * This is the current price of one BOUND MPP request.
 */
const MPP_REQUIRED_RAW =
    1_000_000_000_000_000n;

const BPS_DENOMINATOR =
    10_000n;

const routerAbi =
    parseAbi([
        "function WETH() view returns (address)",
        "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)",
        "function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable returns (uint256[] amounts)",
    ]);

const erc20Abi =
    parseAbi([
        "function balanceOf(address account) view returns (uint256)",
        "function name() view returns (string)",
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)",
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

if (
    !Number.isInteger(
        SLIPPAGE_BPS
    ) ||
    SLIPPAGE_BPS <
    1 ||
    SLIPPAGE_BPS >
    2_000
) {
    throw new Error(
        "BOUND_SWAP_SLIPPAGE_BPS must be an integer between 1 and 2000."
    );
}

const inputWei =
    parseEther(
        INPUT_TBNB
    );

if (
    inputWei <=
    0n
) {
    throw new Error(
        "Swap input must be greater than zero."
    );
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
 * Never print privateKeyText.
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

const walletClient =
    createWalletClient({
        account,

        chain:
            bscTestnet,

        transport:
            http(
                RPC_URL
            ),
    });

/*
 * =======================================================
 * VERIFY NETWORK
 * =======================================================
 */

const chainId =
    await publicClient
        .getChainId();

if (
    chainId !==
    97
) {
    throw new Error(
        `Wrong network. Expected BSC Testnet 97, received ${chainId}.`
    );
}

const blockNumber =
    await publicClient
        .getBlockNumber();

/*
 * =======================================================
 * VERIFY CONTRACTS
 * =======================================================
 */

const [
    routerCode,
    usdtCode,
] =
    await Promise.all([
        publicClient.getBytecode({
            address:
                ROUTER,
        }),

        publicClient.getBytecode({
            address:
                TEST_USDT,
        }),
    ]);

if (
    !routerCode ||
    routerCode ===
    "0x"
) {
    throw new Error(
        "PancakeSwap testnet router bytecode was not found."
    );
}

if (
    !usdtCode ||
    usdtCode ===
    "0x"
) {
    throw new Error(
        "TEST_USDT bytecode was not found."
    );
}

const [
    routerWbnb,
    tokenName,
    tokenSymbol,
    tokenDecimals,
] =
    await Promise.all([
        publicClient.readContract({
            address:
                ROUTER,

            abi:
                routerAbi,

            functionName:
                "WETH",
        }),

        publicClient.readContract({
            address:
                TEST_USDT,

            abi:
                erc20Abi,

            functionName:
                "name",
        }),

        publicClient.readContract({
            address:
                TEST_USDT,

            abi:
                erc20Abi,

            functionName:
                "symbol",
        }),

        publicClient.readContract({
            address:
                TEST_USDT,

            abi:
                erc20Abi,

            functionName:
                "decimals",
        }),
    ]);

if (
    routerWbnb
        .toLowerCase() !==
    WBNB
        .toLowerCase()
) {
    throw new Error(
        "Router wrapped-native-token address does not match expected WBNB."
    );
}

if (
    tokenDecimals !==
    18
) {
    throw new Error(
        `Unexpected TEST_USDT decimals: ${tokenDecimals}. Expected 18.`
    );
}

/*
 * =======================================================
 * READ CURRENT BALANCES
 * =======================================================
 */

const [
    nativeBalanceBefore,
    tokenBalanceBefore,
] =
    await Promise.all([
        publicClient.getBalance({
            address:
                account.address,
        }),

        publicClient.readContract({
            address:
                TEST_USDT,

            abi:
                erc20Abi,

            functionName:
                "balanceOf",

            args: [
                account.address,
            ],
        }),
    ]);

if (
    nativeBalanceBefore <=
    inputWei
) {
    throw new Error(
        "The payer does not have enough tBNB for both swap input and gas."
    );
}

/*
 * =======================================================
 * LIVE PANCAKESWAP QUOTE
 * =======================================================
 */

const path = [
    WBNB,
    TEST_USDT,
] as const;

const amounts =
    await publicClient
        .readContract({
            address:
                ROUTER,

            abi:
                routerAbi,

            functionName:
                "getAmountsOut",

            args: [
                inputWei,
                [
                    ...path,
                ],
            ],
        });

const expectedOutput =
    amounts[
    amounts.length -
    1
    ];

if (
    expectedOutput ===
    undefined ||
    expectedOutput <=
    0n
) {
    throw new Error(
        "PancakeSwap returned no usable TEST_USDT output."
    );
}

/*
 * amountOutMin:
 *
 * quote * (1 - slippage)
 */
const minimumOutput =
    (
        expectedOutput *
        (
            BPS_DENOMINATOR -
            BigInt(
                SLIPPAGE_BPS
            )
        )
    ) /
    BPS_DENOMINATOR;

if (
    minimumOutput <
    MPP_REQUIRED_RAW
) {
    throw new Error(
        [
            "The protected minimum output is not enough for one MPP request.",
            `Expected: ${formatUnits(
                expectedOutput,
                tokenDecimals
            )} ${tokenSymbol}`,
            `Minimum: ${formatUnits(
                minimumOutput,
                tokenDecimals
            )} ${tokenSymbol}`,
            `MPP requires: ${formatUnits(
                MPP_REQUIRED_RAW,
                tokenDecimals
            )} ${tokenSymbol}`,
        ].join(
            " "
        )
    );
}

/*
 * Ten-minute deadline.
 */
const deadline =
    BigInt(
        Math.floor(
            Date.now() /
            1000
        ) +
        10 *
        60
    );

/*
 * =======================================================
 * SIMULATE THE EXACT SWAP
 * =======================================================
 *
 * This sends eth_call/estimation-style RPC requests only.
 * It does not broadcast the transaction.
 */

const simulation =
    await publicClient
        .simulateContract({
            address:
                ROUTER,

            abi:
                routerAbi,

            functionName:
                "swapExactETHForTokens",

            args: [
                minimumOutput,
                [
                    ...path,
                ],
                account.address,
                deadline,
            ],

            account,

            value:
                inputWei,
        });

const estimatedGas =
    await publicClient
        .estimateContractGas({
            address:
                ROUTER,

            abi:
                routerAbi,

            functionName:
                "swapExactETHForTokens",

            args: [
                minimumOutput,
                [
                    ...path,
                ],
                account.address,
                deadline,
            ],

            account:
                account.address,

            value:
                inputWei,
        });

console.log(
    ""
);

console.log(
    "BOUND TEST_USDT SWAP"
);

console.log(
    ""
);

console.log(
    "NETWORK"
);

console.log(
    "Network: BNB Smart Chain Testnet"
);

console.log(
    `Chain ID: ${chainId}`
);

console.log(
    `Latest block: ${blockNumber}`
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
    "Private key printed: false"
);

console.log(
    ""
);

console.log(
    "VERIFIED CONTRACTS"
);

console.log(
    `Router: ${ROUTER}`
);

console.log(
    `WBNB: ${WBNB}`
);

console.log(
    `TEST_USDT: ${TEST_USDT}`
);

console.log(
    `Token name: ${tokenName}`
);

console.log(
    `Token symbol: ${tokenSymbol}`
);

console.log(
    `Token decimals: ${tokenDecimals}`
);

console.log(
    ""
);

console.log(
    "BALANCE BEFORE"
);

console.log(
    `tBNB: ${formatEther(
        nativeBalanceBefore
    )}`
);

console.log(
    `USDT: ${formatUnits(
        tokenBalanceBefore,
        tokenDecimals
    )}`
);

console.log(
    ""
);

console.log(
    "LIVE QUOTE"
);

console.log(
    `Input: ${formatEther(
        inputWei
    )} tBNB`
);

console.log(
    `Expected output: ${formatUnits(
        expectedOutput,
        tokenDecimals
    )} ${tokenSymbol}`
);

console.log(
    `Slippage limit: ${(
        SLIPPAGE_BPS /
        100
    ).toFixed(
        2
    )}%`
);

console.log(
    `Protected minimum output: ${formatUnits(
        minimumOutput,
        tokenDecimals
    )} ${tokenSymbol}`
);

console.log(
    `MPP requires: ${formatUnits(
        MPP_REQUIRED_RAW,
        tokenDecimals
    )} ${tokenSymbol}`
);

console.log(
    ""
);

console.log(
    "SIMULATION"
);

console.log(
    "Simulation: PASS"
);

console.log(
    `Estimated gas units: ${estimatedGas}`
);

console.log(
    `Deadline: ${new Date(
        Number(
            deadline
        ) *
        1000
    ).toISOString()}`
);

console.log(
    ""
);

/*
 * =======================================================
 * PREVIEW MODE
 * =======================================================
 */

if (
    !EXECUTE
) {
    console.log(
        "MODE: PREVIEW"
    );

    console.log(
        "BROADCAST: false"
    );

    console.log(
        "tBNB spent: 0"
    );

    console.log(
        ""
    );

    console.log(
        "To execute this exact type of swap intentionally:"
    );

    console.log(
        "BOUND_EXECUTE_SWAP=YES npm run mpp-swap-test-usdt"
    );

    process.exit(
        0
    );
}

/*
 * =======================================================
 * REAL TESTNET BROADCAST
 * =======================================================
 */

console.log(
    "MODE: EXECUTE"
);

console.log(
    "Broadcasting real BSC Testnet swap..."
);

const hash =
    await walletClient
        .writeContract(
            simulation.request
        );

console.log(
    `Transaction hash: ${hash}`
);

console.log(
    `Explorer: https://testnet.bscscan.com/tx/${hash}`
);

console.log(
    ""
);

console.log(
    "Waiting for confirmation..."
);

const receipt =
    await publicClient
        .waitForTransactionReceipt({
            hash,
        });

if (
    receipt.status !==
    "success"
) {
    throw new Error(
        `Swap transaction ${hash} was mined but reverted.`
    );
}

const [
    nativeBalanceAfter,
    tokenBalanceAfter,
] =
    await Promise.all([
        publicClient.getBalance({
            address:
                account.address,
        }),

        publicClient.readContract({
            address:
                TEST_USDT,

            abi:
                erc20Abi,

            functionName:
                "balanceOf",

            args: [
                account.address,
            ],
        }),
    ]);

const received =
    tokenBalanceAfter -
    tokenBalanceBefore;

console.log(
    ""
);

console.log(
    "CONFIRMED"
);

console.log(
    `Block: ${receipt.blockNumber}`
);

console.log(
    `Status: ${receipt.status}`
);

console.log(
    ""
);

console.log(
    "BALANCE AFTER"
);

console.log(
    `tBNB: ${formatEther(
        nativeBalanceAfter
    )}`
);

console.log(
    `USDT: ${formatUnits(
        tokenBalanceAfter,
        tokenDecimals
    )}`
);

console.log(
    `USDT received: ${formatUnits(
        received,
        tokenDecimals
    )}`
);

console.log(
    ""
);

console.log(
    `Enough for one MPP request: ${tokenBalanceAfter >=
    MPP_REQUIRED_RAW
    }`
);

console.log(
    "BROADCAST: true"
);

console.log(
    "PRIVATE KEY PRINTED: false"
);