import {
    createPublicClient,
    formatEther,
    formatUnits,
    getAddress,
    http,
    parseAbi,
    parseEther,
    type Address,
} from "viem";

import {
    bscTestnet,
} from "viem/chains";

/*
 * =======================================================
 * BOUND — READ-ONLY TEST_USDT ROUTE CHECK
 * =======================================================
 *
 * This script DOES NOT:
 *
 * - read any private key
 * - sign anything
 * - approve any token
 * - swap anything
 * - broadcast any transaction
 *
 * It only performs live read-only RPC calls against
 * BSC Testnet to determine whether a PancakeSwap V2
 * WBNB -> TEST_USDT route exists and has a usable quote.
 */

const RPC_URL =
    process.env.BOUND_BSC_TESTNET_RPC ??
    "https://bsc-testnet-dataseed.bnbchain.org";

const ROUTER =
    getAddress(
        "0xD99D1c33F9fC3444f8101754aBC46c52416550D1"
    );

const FACTORY =
    getAddress(
        "0x6725F303b657a9451d8BA641348b6761A6CC7a17"
    );

const WBNB =
    getAddress(
        "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd"
    );

const TEST_USDT =
    getAddress(
        "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd"
    );

const INPUT_TBNB =
    process.env.BOUND_ROUTE_INPUT_TBNB ??
    "0.01";

const REQUIRED_USDT_RAW =
    1_000_000_000_000_000n;

const ZERO_ADDRESS =
    "0x0000000000000000000000000000000000000000";

const routerAbi =
    parseAbi([
        "function factory() view returns (address)",
        "function WETH() view returns (address)",
        "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)",
    ]);

const factoryAbi =
    parseAbi([
        "function getPair(address tokenA, address tokenB) view returns (address pair)",
    ]);

const pairAbi =
    parseAbi([
        "function token0() view returns (address)",
        "function token1() view returns (address)",
        "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
    ]);

const erc20Abi =
    parseAbi([
        "function name() view returns (string)",
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)",
    ]);

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
        `Wrong RPC chain. Expected 97, received ${chainId}.`
    );
}

const blockNumber =
    await publicClient
        .getBlockNumber();

const [
    routerCode,
    factoryCode,
    wbnbCode,
    usdtCode,
] =
    await Promise.all([
        publicClient.getBytecode({
            address:
                ROUTER,
        }),

        publicClient.getBytecode({
            address:
                FACTORY,
        }),

        publicClient.getBytecode({
            address:
                WBNB,
        }),

        publicClient.getBytecode({
            address:
                TEST_USDT,
        }),
    ]);

const routerExists =
    Boolean(
        routerCode &&
        routerCode !== "0x"
    );

const factoryExists =
    Boolean(
        factoryCode &&
        factoryCode !== "0x"
    );

const wbnbExists =
    Boolean(
        wbnbCode &&
        wbnbCode !== "0x"
    );

const usdtExists =
    Boolean(
        usdtCode &&
        usdtCode !== "0x"
    );

console.log(
    ""
);

console.log(
    "BOUND TEST_USDT ROUTE CHECK"
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
    "CONTRACT PRESENCE"
);

console.log(
    `Router: ${ROUTER}`
);

console.log(
    `Router code exists: ${routerExists}`
);

console.log(
    `Factory: ${FACTORY}`
);

console.log(
    `Factory code exists: ${factoryExists}`
);

console.log(
    `WBNB: ${WBNB}`
);

console.log(
    `WBNB code exists: ${wbnbExists}`
);

console.log(
    `TEST_USDT: ${TEST_USDT}`
);

console.log(
    `TEST_USDT code exists: ${usdtExists}`
);

if (
    !routerExists ||
    !factoryExists ||
    !wbnbExists ||
    !usdtExists
) {
    console.log(
        ""
    );

    console.log(
        "STATUS: CONTRACT_CHECK_FAILED"
    );

    console.log(
        "BROADCAST: false"
    );

    process.exitCode =
        2;
} else {
    const [
        routerFactory,
        routerWrappedNative,
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
                    "factory",
            }),

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

    const routerMatchesFactory =
        routerFactory
            .toLowerCase() ===
        FACTORY
            .toLowerCase();

    const routerMatchesWbnb =
        routerWrappedNative
            .toLowerCase() ===
        WBNB
            .toLowerCase();

    console.log(
        ""
    );

    console.log(
        "ROUTER SELF-REPORT"
    );

    console.log(
        `Router factory(): ${routerFactory}`
    );

    console.log(
        `Expected factory: ${FACTORY}`
    );

    console.log(
        `Factory matches: ${routerMatchesFactory}`
    );

    console.log(
        `Router WETH(): ${routerWrappedNative}`
    );

    console.log(
        `Expected WBNB: ${WBNB}`
    );

    console.log(
        `WBNB matches: ${routerMatchesWbnb}`
    );

    console.log(
        ""
    );

    console.log(
        "PAYMENT TOKEN"
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

    const pair =
        await publicClient
            .readContract({
                address:
                    FACTORY,

                abi:
                    factoryAbi,

                functionName:
                    "getPair",

                args: [
                    WBNB,
                    TEST_USDT,
                ],
            });

    const pairExists =
        pair.toLowerCase() !==
        ZERO_ADDRESS;

    console.log(
        ""
    );

    console.log(
        "PAIR"
    );

    console.log(
        `WBNB/TEST_USDT pair: ${pair}`
    );

    console.log(
        `Pair exists: ${pairExists}`
    );

    let reservesAvailable =
        false;

    if (
        pairExists
    ) {
        const pairAddress =
            getAddress(
                pair
            ) as Address;

        const [
            token0,
            token1,
            reserves,
        ] =
            await Promise.all([
                publicClient.readContract({
                    address:
                        pairAddress,

                    abi:
                        pairAbi,

                    functionName:
                        "token0",
                }),

                publicClient.readContract({
                    address:
                        pairAddress,

                    abi:
                        pairAbi,

                    functionName:
                        "token1",
                }),

                publicClient.readContract({
                    address:
                        pairAddress,

                    abi:
                        pairAbi,

                    functionName:
                        "getReserves",
                }),
            ]);

        const [
            reserve0,
            reserve1,
        ] =
            reserves;

        reservesAvailable =
            reserve0 >
            0n &&
            reserve1 >
            0n;

        console.log(
            `token0: ${token0}`
        );

        console.log(
            `token1: ${token1}`
        );

        console.log(
            `reserve0 raw: ${reserve0}`
        );

        console.log(
            `reserve1 raw: ${reserve1}`
        );

        console.log(
            `Non-zero reserves: ${reservesAvailable}`
        );
    }

    const amountIn =
        parseEther(
            INPUT_TBNB
        );

    let quoteAvailable =
        false;

    let outputRaw:
        bigint | null =
        null;

    let quoteError:
        string | null =
        null;

    try {
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
                        amountIn,

                        [
                            WBNB,
                            TEST_USDT,
                        ],
                    ],
                });

        outputRaw =
            amounts[
            amounts.length -
            1
            ] ??
            null;

        quoteAvailable =
            outputRaw !==
            null &&
            outputRaw >
            0n;
    } catch (
    error
    ) {
        quoteError =
            error instanceof Error
                ? error.message
                : String(
                    error
                );
    }

    console.log(
        ""
    );

    console.log(
        "READ-ONLY QUOTE"
    );

    console.log(
        `Input: ${INPUT_TBNB} tBNB`
    );

    if (
        outputRaw !==
        null
    ) {
        console.log(
            `Expected output: ${formatUnits(
                outputRaw,
                tokenDecimals
            )} ${tokenSymbol}`
        );
    } else {
        console.log(
            "Expected output: unavailable"
        );
    }

    console.log(
        `Quote available: ${quoteAvailable}`
    );

    console.log(
        `Quote error: ${quoteError}`
    );

    console.log(
        ""
    );

    console.log(
        "MPP REQUIREMENT"
    );

    console.log(
        `Required per paid request: ${formatUnits(
            REQUIRED_USDT_RAW,
            tokenDecimals
        )} ${tokenSymbol}`
    );

    const enoughForOneRequest =
        outputRaw !==
        null &&
        outputRaw >=
        REQUIRED_USDT_RAW;

    console.log(
        `Quoted output covers one request: ${enoughForOneRequest}`
    );

    console.log(
        ""
    );

    const routeReady =
        routerMatchesFactory &&
        routerMatchesWbnb &&
        pairExists &&
        reservesAvailable &&
        quoteAvailable &&
        enoughForOneRequest;

    if (
        routeReady
    ) {
        console.log(
            "STATUS: ROUTE_AVAILABLE"
        );
    } else {
        console.log(
            "STATUS: ROUTE_UNAVAILABLE"
        );
    }

    console.log(
        "BROADCAST: false"
    );

    console.log(
        `tBNB spent: ${formatEther(
            0n
        )}`
    );
}