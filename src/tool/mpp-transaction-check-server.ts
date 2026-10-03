import {
    serve,
} from "@hono/node-server";

import {
    chargeFromDecimal,
} from "@bnb-chain/mpp";

import {
    chargeAsync,
} from "@bnb-chain/mpp/server";

import {
    Hono,
} from "hono";

import {
    Mppx,
} from "mppx/server";

import {
    createPublicClient,
    getAddress,
    http,
    isAddress,
    type Address,
    type Hex,
} from "viem";

import {
    bscTestnet,
} from "viem/chains";

import {
    getToolRequestHash,
    type ToolRequest,
} from "../core/request-bound.js";

import {
    fetchTransactionFacts,
    normalizeTransactionInput,
} from "../chain/transaction-intelligence.js";

import {
    buildTransactionExplanation,
} from "../chain/transaction-explanation.js";

import {
    buildTransactionAnalysisToolRequest,
    TRANSACTION_ANALYSIS_CHAIN_ID,
    TRANSACTION_ANALYSIS_METHOD,
    TRANSACTION_ANALYSIS_NETWORK,
    TRANSACTION_ANALYSIS_TOOL_ID,
} from "../core/intent-manifest.js";

/*
 * =======================================================
 * BOUND — MPP TRANSACTION ANALYSIS SERVICE
 * =======================================================
 *
 * Purpose:
 *
 * 1. Expose a real HTTP 402 challenge using the official
 *    BNB MPP SDK.
 *
 * 2. After MPP verifies a real BSC Testnet payment,
 *    perform an actual BSC Testnet transaction analysis.
 *
 * Nothing in this server fabricates blockchain results.
 *
 * Development limitation:
 *
 * allowMemoryStore is explicitly enabled below because
 * this is currently a local, single-process integration
 * environment.
 *
 * It MUST be replaced by a durable atomic replay store
 * before making any production-readiness claim.
 */

const PORT =
    Number(
        process.env.BOUND_MPP_TOOL_PORT ??
        "8788"
    );

const RPC_URL =
    process.env.BOUND_BSC_TESTNET_RPC ??
    "https://bsc-testnet-dataseed.bnbchain.org";

const MPP_SECRET_KEY =
    process.env.MPP_SECRET_KEY;

const RECIPIENT_RAW =
    process.env.BOUND_MPP_RECIPIENT;

const TOOL_ID =
    TRANSACTION_ANALYSIS_TOOL_ID;

const TOOL_METHOD =
    TRANSACTION_ANALYSIS_METHOD;

const NETWORK_NAME =
    TRANSACTION_ANALYSIS_NETWORK;

const CHAIN_ID =
    TRANSACTION_ANALYSIS_CHAIN_ID;

const TOKEN_PRESET =
    "TEST_USDT" as const;

const TOOL_PRICE =
    "0.001";

/*
 * TEST_USDT in the BNB MPP BSC Testnet curated preset
 * uses 18 decimals.
 */
const TOOL_CHARGE =
    chargeFromDecimal({
        amount:
            TOOL_PRICE,

        decimals:
            18,
    });

/*
 * =======================================================
 * STARTUP VALIDATION
 * =======================================================
 */

if (
    !MPP_SECRET_KEY
) {
    throw new Error(
        "MPP_SECRET_KEY is required."
    );
}

if (
    !RECIPIENT_RAW
) {
    throw new Error(
        "BOUND_MPP_RECIPIENT is required."
    );
}

if (
    !isAddress(
        RECIPIENT_RAW
    )
) {
    throw new Error(
        "BOUND_MPP_RECIPIENT must be a valid EVM address."
    );
}

let parsedRpcUrl:
    URL;

try {
    parsedRpcUrl =
        new URL(
            RPC_URL
        );
} catch {
    throw new Error(
        "BOUND_BSC_TESTNET_RPC must be a valid URL."
    );
}

if (
    parsedRpcUrl.protocol !==
    "https:" &&
    parsedRpcUrl.protocol !==
    "http:"
) {
    throw new Error(
        "BOUND_BSC_TESTNET_RPC must use http:// or https://."
    );
}

const RECIPIENT =
    getAddress(
        RECIPIENT_RAW
    );

/*
 * =======================================================
 * REAL BSC TESTNET RPC CLIENT
 * =======================================================
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

/*
 * =======================================================
 * OFFICIAL BNB MPP CHARGE METHOD
 * =======================================================
 *
 * credentialTypes = ["hash"]
 *
 * The payer broadcasts the token transfer itself.
 * The server then verifies the referenced transaction.
 *
 * No settlement private key is loaded here.
 *
 * allowMemoryStore:
 *
 * Explicitly enabled only for this local single-process
 * integration environment.
 */

const evmCharge =
    await chargeAsync({
        chain:
            "bsc-testnet",

        token:
            TOKEN_PRESET,

        recipient:
            RECIPIENT,

        credentialTypes: [
            "hash",
        ],

        challengeBinding: {
            mode:
                "mppx-managed",
        },

        rpcUrl:
            RPC_URL,

        allowMemoryStore:
            true,
    });

const mppx =
    Mppx.create({
        methods: [
            evmCharge,
        ],

        secretKey:
            MPP_SECRET_KEY,
    });

/*
 * =======================================================
 * INPUT
 * =======================================================
 */

type TransactionAnalysisInput = {
    transactionHash:
        `0x${string}`;
};

function parseTransactionAnalysisInput(
    query:
        Record<
            string,
            string
        >
):
    TransactionAnalysisInput {
    if (
        !query.transactionHash
    ) {
        throw new Error(
            "transactionHash is required"
        );
    }

    const normalized =
        normalizeTransactionInput(
            query.transactionHash
        );

    return {
        transactionHash:
            normalized.hash,
    };
}

/*
 * =======================================================
 * REQUEST BINDING
 * =======================================================
 *
 * The paid service reconstructs the request using the
 * exact same canonical primitive used by the agent and
 * the BOUND product API.
 */

function buildToolRequest(
    input:
        TransactionAnalysisInput
): ToolRequest {
    return buildTransactionAnalysisToolRequest(
        input.transactionHash
    );
}

/*
 * =======================================================
 * REAL TRANSACTION ANALYSIS
 * =======================================================
 *
 * The protected paid operation reads an existing BSC
 * Testnet transaction from the real RPC path.
 *
 * It does not simulate a new transaction and does not
 * invent blockchain facts.
 */

async function runTransactionAnalysis(
    input:
        TransactionAnalysisInput
) {
    const facts =
        await fetchTransactionFacts(
            input.transactionHash
        );

    const explanation =
        buildTransactionExplanation(
            facts
        );

    return {
        source:
            "live-bsc-testnet-rpc",

        network:
            NETWORK_NAME,

        chainId:
            facts.subject.chainId,

        blockNumber:
            facts.transaction.blockNumber,

        checkedTransaction: {
            transactionHash:
                facts.subject.transactionHash,
        },

        /*
         * Kept for compatibility with the current product
         * response shape while the dashboard is migrated.
         */
        rpcResult:
            facts,

        facts,

        explanation,
    };
}

/*
 * =======================================================
 * HTTP SERVER
 * =======================================================
 */

const app =
    new Hono();

/*
 * Free health endpoint.
 *
 * This proves whether the configured BSC Testnet RPC
 * is reachable at the time of the request.
 */
app.get(
    "/health",
    async (
        c
    ) => {
        let rpcReachable =
            false;

        let latestBlock:
            string | null =
            null;

        let rpcChainId:
            number | null =
            null;

        let rpcError:
            string | null =
            null;

        try {
            const [
                chainId,
                blockNumber,
            ] =
                await Promise.all([
                    publicClient
                        .getChainId(),

                    publicClient
                        .getBlockNumber(),
                ]);

            rpcChainId =
                chainId;

            latestBlock =
                blockNumber.toString();

            rpcReachable =
                true;
        } catch (
        error
        ) {
            rpcError =
                error instanceof Error
                    ? error.message
                    : String(
                        error
                    );
        }

        return c.json({
            status:
                "ok",

            service:
                "BOUND MPP Transaction Analysis",

            protocol:
                "BNB MPP",

            network:
                NETWORK_NAME,

            expectedChainId:
                CHAIN_ID,

            payment: {
                chain:
                    "bsc-testnet",

                token:
                    TOKEN_PRESET,

                amount:
                    TOOL_PRICE,

                recipient:
                    RECIPIENT,

                credentialTypes: [
                    "hash",
                ],
            },

            replayProtection: {
                mode:
                    "memory",

                scope:
                    "local-single-process",

                productionReady:
                    false,
            },

            rpc: {
                reachable:
                    rpcReachable,

                chainId:
                    rpcChainId,

                latestBlock,

                error:
                    rpcError,
            },
        });
    }
);

/*
 * Paid endpoint.
 *
 * Malformed transaction-analysis requests are rejected before
 * payment is requested.
 */
app.get(
    "/api/transaction-analysis",
    async (
        c
    ) => {
        let input:
            TransactionAnalysisInput;

        try {
            input =
                parseTransactionAnalysisInput(
                    c.req.query()
                );
        } catch (
        error
        ) {
            return c.json(
                {
                    error:
                        "INVALID_TRANSACTION_ANALYSIS_REQUEST",

                    message:
                        error instanceof Error
                            ? error.message
                            : String(
                                error
                            ),
                },
                400
            );
        }

        const toolRequest =
            buildToolRequest(
                input
            );

        const requestHash =
            getToolRequestHash(
                toolRequest
            );

        /*
         * This call is handled by mppx + @bnb-chain/mpp.
         *
         * No credential:
         *   -> genuine HTTP 402 challenge.
         *
         * Valid hash credential:
         *   -> SDK verifies the referenced BSC Testnet payment.
         */
        const payment =
            await mppx.evm.charge(
                TOOL_CHARGE
            )(
                c.req.raw
            );

        if (
            payment.status ===
            402
        ) {
            return payment.challenge;
        }

        /*
         * Paid operation only executes after MPP accepts
         * the payment credential.
         */
        const result =
            await runTransactionAnalysis(
                input
            );

        /*
         * withReceipt() attaches the real MPP
         * Payment-Receipt header.
         */
        return payment.withReceipt(
            Response.json({
                request: {
                    toolId:
                        toolRequest.toolId,

                    method:
                        toolRequest.method,

                    arguments:
                        toolRequest.arguments,

                    requestHash,
                },

                result,
            })
        );
    }
);

/*
 * =======================================================
 * START SERVER
 * =======================================================
 */

serve(
    {
        fetch:
            app.fetch,

        port:
            PORT,
    },

    (
        info
    ) => {
        console.log(
            ""
        );

        console.log(
            "BOUND MPP TRANSACTION ANALYSIS"
        );

        console.log(
            `Listening: http://127.0.0.1:${info.port}`
        );

        console.log(
            `Network: ${NETWORK_NAME} (${CHAIN_ID})`
        );

        console.log(
            `RPC: ${RPC_URL}`
        );

        console.log(
            `Payment token: ${TOKEN_PRESET}`
        );

        console.log(
            `Price: ${TOOL_PRICE} ${TOKEN_PRESET}`
        );

        console.log(
            `Recipient: ${RECIPIENT}`
        );

        console.log(
            "Credential: hash (payer broadcasts)"
        );

        console.log(
            "Replay store: memory (local single-process only)"
        );

        console.log(
            "Settlement private key loaded: false"
        );

        console.log(
            ""
        );
    }
);