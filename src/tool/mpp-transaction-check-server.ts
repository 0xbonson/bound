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

/*
 * =======================================================
 * BOUND — MPP TRANSACTION CHECK SERVICE
 * =======================================================
 *
 * Purpose:
 *
 * 1. Expose a real HTTP 402 challenge using the official
 *    BNB MPP SDK.
 *
 * 2. After MPP verifies a real BSC Testnet payment,
 *    perform an actual BSC Testnet RPC transaction check.
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
    "bound-transaction-check";

const TOOL_METHOD =
    "simulate_transaction";

const NETWORK_NAME =
    "BNB Smart Chain Testnet";

const CHAIN_ID =
    97;

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

type TransactionCheckInput = {
    from:
    Address;

    to:
    Address;

    valueWei:
    string;

    data:
    Hex;
};

function parseUnsignedInteger(
    value:
        string | undefined,
    field:
        string
): string {
    if (
        value ===
        undefined
    ) {
        throw new Error(
            `${field} is required`
        );
    }

    if (
        !/^(0|[1-9]\d*)$/.test(
            value
        )
    ) {
        throw new Error(
            `${field} must be an unsigned base-10 integer`
        );
    }

    return value;
}

function parseHexData(
    value:
        string | undefined
): Hex {
    const data =
        value ??
        "0x";

    if (
        !/^0x(?:[0-9a-fA-F]{2})*$/.test(
            data
        )
    ) {
        throw new Error(
            "data must be an even-length 0x-prefixed hex string"
        );
    }

    return data as Hex;
}

function parseAddress(
    value:
        string | undefined,
    field:
        string
): Address {
    if (
        !value
    ) {
        throw new Error(
            `${field} is required`
        );
    }

    if (
        !isAddress(
            value
        )
    ) {
        throw new Error(
            `${field} must be a valid EVM address`
        );
    }

    return getAddress(
        value
    );
}

function parseTransactionCheckInput(
    query:
        Record<
            string,
            string
        >
): TransactionCheckInput {
    return {
        from:
            parseAddress(
                query.from,
                "from"
            ),

        to:
            parseAddress(
                query.to,
                "to"
            ),

        valueWei:
            parseUnsignedInteger(
                query.valueWei,
                "valueWei"
            ),

        data:
            parseHexData(
                query.data
            ),
    };
}

/*
 * =======================================================
 * REQUEST BINDING
 * =======================================================
 */

function buildToolRequest(
    input:
        TransactionCheckInput
): ToolRequest {
    return {
        toolId:
            TOOL_ID,

        method:
            TOOL_METHOD,

        arguments: {
            chainId:
                CHAIN_ID,

            from:
                input.from,

            to:
                input.to,

            valueWei:
                input.valueWei,

            data:
                input.data,
        },
    };
}

/*
 * =======================================================
 * REAL TRANSACTION CHECK
 * =======================================================
 *
 * Both eth_call and eth_estimateGas are sent to the
 * configured BSC Testnet RPC.
 *
 * A failed call is reported as a real RPC failure/revert;
 * it is not converted into a fake success.
 */

async function runTransactionCheck(
    input:
        TransactionCheckInput
) {
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

    let callSucceeded =
        false;

    let returnData:
        Hex | null =
        null;

    let callError:
        string | null =
        null;

    try {
        const result =
            await publicClient.call({
                account:
                    input.from,

                to:
                    input.to,

                value:
                    BigInt(
                        input.valueWei
                    ),

                data:
                    input.data,
            });

        callSucceeded =
            true;

        returnData =
            result.data ??
            "0x";
    } catch (
    error
    ) {
        callError =
            error instanceof Error
                ? error.message
                : String(
                    error
                );
    }

    let gasEstimate:
        string | null =
        null;

    let gasEstimateError:
        string | null =
        null;

    try {
        const gas =
            await publicClient
                .estimateGas({
                    account:
                        input.from,

                    to:
                        input.to,

                    value:
                        BigInt(
                            input.valueWei
                        ),

                    data:
                        input.data,
                });

        gasEstimate =
            gas.toString();
    } catch (
    error
    ) {
        gasEstimateError =
            error instanceof Error
                ? error.message
                : String(
                    error
                );
    }

    return {
        source:
            "live-bsc-testnet-rpc",

        network:
            NETWORK_NAME,

        chainId,

        blockNumber:
            blockNumber.toString(),

        checkedTransaction: {
            from:
                input.from,

            to:
                input.to,

            valueWei:
                input.valueWei,

            data:
                input.data,
        },

        rpcResult: {
            callSucceeded,

            returnData,

            callError,

            gasEstimate,

            gasEstimateError,
        },
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
                "BOUND MPP Transaction Check",

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
 * Malformed transaction requests are rejected before
 * payment is requested.
 */
app.get(
    "/api/transaction-check",
    async (
        c
    ) => {
        let input:
            TransactionCheckInput;

        try {
            input =
                parseTransactionCheckInput(
                    c.req.query()
                );
        } catch (
        error
        ) {
            return c.json(
                {
                    error:
                        "INVALID_TRANSACTION_CHECK_REQUEST",

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
            await runTransactionCheck(
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
            "BOUND MPP TRANSACTION CHECK"
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