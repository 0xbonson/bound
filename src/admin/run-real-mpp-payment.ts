import {
    readFile,
} from "node:fs/promises";

import {
    deserializeEvmReceipt,
} from "@bnb-chain/mpp";

import {
    createHashCredential,
} from "@bnb-chain/mpp/client";

import {
    Challenge,
} from "mppx";

import {
    createPublicClient,
    createWalletClient,
    formatEther,
    formatUnits,
    getAddress,
    http,
    isAddress,
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
 * BOUND — REAL BNB MPP PAYMENT CLIENT
 * =======================================================
 *
 * Performs a real end-to-end BNB MPP payment:
 *
 * 1. Request protected tool.
 * 2. Receive genuine HTTP 402 challenge.
 * 3. Parse challenge using mppx.
 * 4. Verify chain/token/recipient/amount.
 * 5. Simulate exact TEST_USDT transfer.
 * 6. Broadcast real BSC Testnet ERC-20 transfer.
 * 7. Wait for onchain confirmation.
 * 8. Build official BNB MPP hash credential.
 * 9. Bind credential.source to the real tx sender.
 * 10. Retry the exact same protected request.
 * 11. Receive HTTP 200 + Payment-Receipt.
 * 12. Decode and verify the receipt.
 * 13. Verify receipt.reference equals the payment tx hash.
 * 14. Read the real paid RPC result.
 *
 * IMPORTANT:
 *
 * - BSC TESTNET only.
 * - No private key is printed.
 * - Payment parameters come from the actual MPP challenge.
 * - BOUND fails closed if payment terms differ from policy.
 * - Server default hashFromPolicy="strict_from" requires
 *   credential.source in DID PKH form.
 */

const RPC_URL =
    process.env.BOUND_BSC_TESTNET_RPC ??
    "https://bsc-testnet-dataseed.bnbchain.org";

const TOOL_BASE_URL =
    process.env.BOUND_MPP_TOOL_URL ??
    "http://127.0.0.1:8788";

const PRIVATE_KEY_PATH =
    process.env.BOUND_AGENT_PRIVATE_KEY_PATH ??
    ".bound/agent/private-key";

const EXPECTED_CHAIN_ID =
    97;

const EXPECTED_TOKEN =
    getAddress(
        "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd"
    );

const EXPECTED_RECIPIENT =
    getAddress(
        process.env.BOUND_MPP_RECIPIENT ??
        "0x32438de3179df205c63e8793A20BA6885762f537"
    );

/*
 * Maximum permitted payment for this integration test:
 *
 * 0.001 TEST_USDT
 * TEST_USDT uses 18 decimals.
 */
const MAX_PAYMENT_RAW =
    1_000_000_000_000_000n;

/*
 * The transaction that the paid service will check.
 *
 * These are NOT the MPP payment fields.
 * They are arguments to the paid transaction-check tool.
 */
const CHECK_FROM =
    getAddress(
        process.env.BOUND_CHECK_FROM ??
        "0x471F83E136A45a3E46Caa1A258B88e447d5D5F76"
    );

const CHECK_TO =
    getAddress(
        process.env.BOUND_CHECK_TO ??
        "0x32438de3179df205c63e8793A20BA6885762f537"
    );

const CHECK_VALUE_WEI =
    process.env.BOUND_CHECK_VALUE_WEI ??
    "0";

const CHECK_DATA =
    process.env.BOUND_CHECK_DATA ??
    "0x";

const erc20Abi =
    parseAbi([
        "function transfer(address to, uint256 amount) returns (bool)",
        "function balanceOf(address account) view returns (uint256)",
        "function decimals() view returns (uint8)",
        "function symbol() view returns (string)",
    ]);

type MppChargeRequest = {
    amount:
    string;

    currency:
    string;

    recipient:
    string;

    methodDetails: {
        chainId:
        number;

        credentialTypes?:
        string[];

        decimals?:
        number;
    };
};

type PaidToolBody = {
    request?: {
        toolId?:
        string;

        method?:
        string;

        arguments?:
        unknown;

        requestHash?:
        string;
    };

    result?: {
        source?:
        string;

        network?:
        string;

        chainId?:
        number;

        blockNumber?:
        string;

        checkedTransaction?:
        unknown;

        rpcResult?:
        unknown;
    };
};

/*
 * =======================================================
 * PRIVATE KEY PARSING
 * =======================================================
 */

function parsePrivateKey(
    value:
        string
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

/*
 * =======================================================
 * CHALLENGE REQUEST VALIDATION
 * =======================================================
 */

function parseChallengeRequest(
    value:
        unknown
): MppChargeRequest {
    if (
        typeof value !==
        "object" ||
        value ===
        null
    ) {
        throw new Error(
            "MPP challenge request is not an object."
        );
    }

    const request =
        value as Record<
            string,
            unknown
        >;

    if (
        typeof request.amount !==
        "string"
    ) {
        throw new Error(
            "MPP challenge amount is missing or invalid."
        );
    }

    if (
        typeof request.currency !==
        "string" ||
        !isAddress(
            request.currency
        )
    ) {
        throw new Error(
            "MPP challenge currency is missing or invalid."
        );
    }

    if (
        typeof request.recipient !==
        "string" ||
        !isAddress(
            request.recipient
        )
    ) {
        throw new Error(
            "MPP challenge recipient is missing or invalid."
        );
    }

    if (
        typeof request.methodDetails !==
        "object" ||
        request.methodDetails ===
        null
    ) {
        throw new Error(
            "MPP challenge methodDetails is missing."
        );
    }

    const details =
        request.methodDetails as Record<
            string,
            unknown
        >;

    if (
        typeof details.chainId !==
        "number"
    ) {
        throw new Error(
            "MPP challenge chainId is missing or invalid."
        );
    }

    const credentialTypes =
        Array.isArray(
            details.credentialTypes
        )
            ? details.credentialTypes.filter(
                (
                    item
                ): item is string =>
                    typeof item ===
                    "string"
            )
            : undefined;

    const decimals =
        typeof details.decimals ===
            "number"
            ? details.decimals
            : undefined;

    return {
        amount:
            request.amount,

        currency:
            request.currency,

        recipient:
            request.recipient,

        methodDetails: {
            chainId:
                details.chainId,

            credentialTypes,

            decimals,
        },
    };
}

/*
 * =======================================================
 * PROTECTED TOOL URL
 * =======================================================
 */

function buildProtectedUrl():
    string {
    const url =
        new URL(
            "/api/transaction-check",
            TOOL_BASE_URL
        );

    url.searchParams.set(
        "from",
        CHECK_FROM
    );

    url.searchParams.set(
        "to",
        CHECK_TO
    );

    url.searchParams.set(
        "valueWei",
        CHECK_VALUE_WEI
    );

    url.searchParams.set(
        "data",
        CHECK_DATA
    );

    return url.toString();
}

/*
 * =======================================================
 * LOAD EXISTING PROTECTED AGENT WALLET
 * =======================================================
 */

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
 *
 * Default BNB MPP hash verification uses:
 *
 * hashFromPolicy = "strict_from"
 *
 * Therefore hash credentials must include a source DID
 * identifying the actual ERC-20 Transfer.from address.
 */
const payerSourceDid =
    `did:pkh:eip155:${EXPECTED_CHAIN_ID}:${account.address}`;

/*
 * =======================================================
 * LIVE BSC TESTNET CLIENTS
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
 * VERIFY LIVE NETWORK
 * =======================================================
 */

const chainId =
    await publicClient
        .getChainId();

if (
    chainId !==
    EXPECTED_CHAIN_ID
) {
    throw new Error(
        `Wrong RPC chain. Expected ${EXPECTED_CHAIN_ID}, received ${chainId}.`
    );
}

const blockBefore =
    await publicClient
        .getBlockNumber();

const [
    payerGasBefore,
    payerTokenBefore,
    merchantTokenBefore,
    tokenDecimals,
    tokenSymbol,
] =
    await Promise.all([
        publicClient.getBalance({
            address:
                account.address,
        }),

        publicClient.readContract({
            address:
                EXPECTED_TOKEN,

            abi:
                erc20Abi,

            functionName:
                "balanceOf",

            args: [
                account.address,
            ],
        }),

        publicClient.readContract({
            address:
                EXPECTED_TOKEN,

            abi:
                erc20Abi,

            functionName:
                "balanceOf",

            args: [
                EXPECTED_RECIPIENT,
            ],
        }),

        publicClient.readContract({
            address:
                EXPECTED_TOKEN,

            abi:
                erc20Abi,

            functionName:
                "decimals",
        }),

        publicClient.readContract({
            address:
                EXPECTED_TOKEN,

            abi:
                erc20Abi,

            functionName:
                "symbol",
        }),
    ]);

const protectedUrl =
    buildProtectedUrl();

/*
 * =======================================================
 * STEP 1 — RECEIVE REAL HTTP 402
 * =======================================================
 */

console.log(
    ""
);

console.log(
    "BOUND REAL MPP PAYMENT"
);

console.log(
    ""
);

console.log(
    "STEP 1 — REQUEST PROTECTED TOOL"
);

console.log(
    `URL: ${protectedUrl}`
);

const initialResponse =
    await fetch(
        protectedUrl,
        {
            redirect:
                "error",
        }
    );

console.log(
    `HTTP status: ${initialResponse.status}`
);

if (
    initialResponse.status !==
    402
) {
    const body =
        await initialResponse.text();

    throw new Error(
        `Expected HTTP 402 but received ${initialResponse.status}. Body: ${body}`
    );
}

const authenticateHeader =
    initialResponse.headers.get(
        "www-authenticate"
    );

if (
    !authenticateHeader
) {
    throw new Error(
        "HTTP 402 response did not include WWW-Authenticate."
    );
}

console.log(
    "WWW-Authenticate received: true"
);

/*
 * Parse the challenge using mppx itself.
 */
const challenge =
    Challenge.fromResponse(
        initialResponse
    );

if (
    challenge.method !==
    "evm"
) {
    throw new Error(
        `Unexpected MPP method: ${challenge.method}`
    );
}

if (
    challenge.intent !==
    "charge"
) {
    throw new Error(
        `Unexpected MPP intent: ${challenge.intent}`
    );
}

if (
    challenge.expires &&
    Date.parse(
        challenge.expires
    ) <=
    Date.now()
) {
    throw new Error(
        "MPP challenge already expired."
    );
}

const paymentRequest =
    parseChallengeRequest(
        challenge.request
    );

/*
 * =======================================================
 * STEP 2 — FAIL-CLOSED CHALLENGE VERIFICATION
 * =======================================================
 */

console.log(
    ""
);

console.log(
    "STEP 2 — VERIFY CHALLENGE"
);

const challengeCurrency =
    getAddress(
        paymentRequest.currency
    );

const challengeRecipient =
    getAddress(
        paymentRequest.recipient
    );

const challengeAmount =
    BigInt(
        paymentRequest.amount
    );

if (
    paymentRequest.methodDetails.chainId !==
    EXPECTED_CHAIN_ID
) {
    throw new Error(
        `MPP requested chain ${paymentRequest.methodDetails.chainId}; expected ${EXPECTED_CHAIN_ID}.`
    );
}

if (
    challengeCurrency
        .toLowerCase() !==
    EXPECTED_TOKEN
        .toLowerCase()
) {
    throw new Error(
        `MPP requested unexpected payment token ${challengeCurrency}.`
    );
}

if (
    challengeRecipient
        .toLowerCase() !==
    EXPECTED_RECIPIENT
        .toLowerCase()
) {
    throw new Error(
        `MPP requested unexpected recipient ${challengeRecipient}.`
    );
}

if (
    challengeAmount >
    MAX_PAYMENT_RAW
) {
    throw new Error(
        `MPP requested ${challengeAmount} raw units, above BOUND cap ${MAX_PAYMENT_RAW}.`
    );
}

if (
    challengeAmount <=
    0n
) {
    throw new Error(
        "MPP requested a non-positive payment."
    );
}

const credentialTypes =
    paymentRequest
        .methodDetails
        .credentialTypes ??
    [];

if (
    !credentialTypes.includes(
        "hash"
    )
) {
    throw new Error(
        "MPP challenge does not permit the hash credential."
    );
}

if (
    payerTokenBefore <
    challengeAmount
) {
    throw new Error(
        "Payer does not hold enough TEST_USDT for this challenge."
    );
}

if (
    payerGasBefore <=
    0n
) {
    throw new Error(
        "Payer has no tBNB for transaction gas."
    );
}

console.log(
    `Challenge ID: ${challenge.id}`
);

console.log(
    `Chain ID: ${paymentRequest.methodDetails.chainId}`
);

console.log(
    `Currency: ${challengeCurrency}`
);

console.log(
    `Recipient: ${challengeRecipient}`
);

console.log(
    `Amount: ${formatUnits(
        challengeAmount,
        tokenDecimals
    )} ${tokenSymbol}`
);

console.log(
    `Credential types: ${credentialTypes.join(
        ", "
    )}`
);

console.log(
    `Payer: ${account.address}`
);

console.log(
    `Credential source: ${payerSourceDid}`
);

console.log(
    "BOUND challenge checks: PASS"
);

/*
 * =======================================================
 * STEP 3 — SIMULATE EXACT ERC-20 PAYMENT
 * =======================================================
 */

console.log(
    ""
);

console.log(
    "STEP 3 — SIMULATE ERC-20 PAYMENT"
);

const transferSimulation =
    await publicClient
        .simulateContract({
            address:
                challengeCurrency,

            abi:
                erc20Abi,

            functionName:
                "transfer",

            args: [
                challengeRecipient,

                challengeAmount,
            ],

            account,
        });

const estimatedGas =
    await publicClient
        .estimateContractGas({
            address:
                challengeCurrency,

            abi:
                erc20Abi,

            functionName:
                "transfer",

            args: [
                challengeRecipient,

                challengeAmount,
            ],

            account:
                account.address,
        });

console.log(
    "Simulation: PASS"
);

console.log(
    `Estimated gas units: ${estimatedGas}`
);

/*
 * =======================================================
 * STEP 4 — REAL BSC TESTNET PAYMENT
 * =======================================================
 */

console.log(
    ""
);

console.log(
    "STEP 4 — BROADCAST REAL TESTNET PAYMENT"
);

const paymentHash =
    await walletClient
        .writeContract(
            transferSimulation.request
        );

console.log(
    `Payment tx: ${paymentHash}`
);

console.log(
    `Explorer: https://testnet.bscscan.com/tx/${paymentHash}`
);

console.log(
    "Waiting for confirmation..."
);

const paymentReceipt =
    await publicClient
        .waitForTransactionReceipt({
            hash:
                paymentHash,
        });

if (
    paymentReceipt.status !==
    "success"
) {
    throw new Error(
        `MPP payment transaction ${paymentHash} reverted.`
    );
}

console.log(
    `Payment confirmed in block: ${paymentReceipt.blockNumber}`
);

/*
 * =======================================================
 * STEP 5 — BUILD OFFICIAL HASH CREDENTIAL
 * =======================================================
 *
 * IMPORTANT:
 *
 * @bnb-chain/mpp hash verification defaults to:
 *
 * hashFromPolicy = "strict_from"
 *
 * Therefore source MUST identify the real tx sender using:
 *
 * did:pkh:eip155:<chainId>:<address>
 *
 * Server verification will compare this address against
 * the actual Transfer.from event in the payment receipt.
 */

console.log(
    ""
);

console.log(
    "STEP 5 — BUILD MPP HASH CREDENTIAL"
);

const credential =
    await createHashCredential({
        challenge,

        hash:
            paymentHash,

        source:
            payerSourceDid,
    });

console.log(
    "Credential created by @bnb-chain/mpp: true"
);

console.log(
    "strict_from source included: true"
);

/*
 * =======================================================
 * STEP 6 — RETRY EXACT SAME PROTECTED REQUEST
 * =======================================================
 */

console.log(
    ""
);

console.log(
    "STEP 6 — RETRY PROTECTED TOOL"
);

const paidResponse =
    await fetch(
        protectedUrl,
        {
            headers: {
                Authorization:
                    credential,
            },

            redirect:
                "error",
        }
    );

console.log(
    `HTTP status: ${paidResponse.status}`
);

if (
    paidResponse.status !==
    200
) {
    const body =
        await paidResponse.text();

    throw new Error(
        `Paid MPP request failed with HTTP ${paidResponse.status}. Body: ${body}`
    );
}

const paymentReceiptHeader =
    paidResponse.headers.get(
        "payment-receipt"
    );

if (
    !paymentReceiptHeader
) {
    throw new Error(
        "Paid response did not include Payment-Receipt."
    );
}

/*
 * =======================================================
 * STEP 7 — VERIFY REAL MPP PAYMENT RECEIPT
 * =======================================================
 */

console.log(
    ""
);

console.log(
    "STEP 7 — VERIFY PAYMENT RECEIPT"
);

const decodedReceipt =
    deserializeEvmReceipt(
        paymentReceiptHeader
    );

if (
    decodedReceipt.status !==
    "success"
) {
    throw new Error(
        `MPP receipt returned unexpected status ${decodedReceipt.status}.`
    );
}

if (
    decodedReceipt.chainId !==
    EXPECTED_CHAIN_ID
) {
    throw new Error(
        `MPP receipt chainId ${decodedReceipt.chainId} does not match ${EXPECTED_CHAIN_ID}.`
    );
}

if (
    decodedReceipt.reference
        .toLowerCase() !==
    paymentHash
        .toLowerCase()
) {
    throw new Error(
        "MPP receipt reference does not match the actual payment transaction hash."
    );
}

console.log(
    `Receipt status: ${decodedReceipt.status}`
);

console.log(
    `Receipt chain ID: ${decodedReceipt.chainId}`
);

console.log(
    `Receipt reference: ${decodedReceipt.reference}`
);

console.log(
    "Receipt matches payment tx: true"
);

/*
 * =======================================================
 * STEP 8 — READ REAL PAID TOOL RESULT
 * =======================================================
 */

const body =
    await paidResponse
        .json() as PaidToolBody;

if (
    body.result?.source !==
    "live-bsc-testnet-rpc"
) {
    throw new Error(
        "Paid tool response did not identify live BSC Testnet RPC as its result source."
    );
}

if (
    body.result.chainId !==
    EXPECTED_CHAIN_ID
) {
    throw new Error(
        `Paid tool returned chainId=${body.result.chainId}; expected ${EXPECTED_CHAIN_ID}.`
    );
}

const [
    payerGasAfter,
    payerTokenAfter,
    merchantTokenAfter,
    blockAfter,
] =
    await Promise.all([
        publicClient.getBalance({
            address:
                account.address,
        }),

        publicClient.readContract({
            address:
                EXPECTED_TOKEN,

            abi:
                erc20Abi,

            functionName:
                "balanceOf",

            args: [
                account.address,
            ],
        }),

        publicClient.readContract({
            address:
                EXPECTED_TOKEN,

            abi:
                erc20Abi,

            functionName:
                "balanceOf",

            args: [
                EXPECTED_RECIPIENT,
            ],
        }),

        publicClient.getBlockNumber(),
    ]);

const payerTokenDelta =
    payerTokenBefore -
    payerTokenAfter;

const merchantTokenDelta =
    merchantTokenAfter -
    merchantTokenBefore;

console.log(
    ""
);

console.log(
    "STEP 8 — REAL PAID TOOL RESULT"
);

console.log(
    `Tool ID: ${body.request?.toolId}`
);

console.log(
    `Tool method: ${body.request?.method}`
);

console.log(
    `BOUND request hash: ${body.request?.requestHash}`
);

console.log(
    `RPC source: ${body.result.source}`
);

console.log(
    `RPC block: ${body.result.blockNumber}`
);

console.log(
    ""
);

console.log(
    JSON.stringify(
        body.result.rpcResult,
        null,
        2
    )
);

/*
 * =======================================================
 * FINAL AUDIT
 * =======================================================
 */

console.log(
    ""
);

console.log(
    "BOUND REAL MPP AUDIT"
);

console.log(
    `Payer: ${account.address}`
);

console.log(
    `Credential source: ${payerSourceDid}`
);

console.log(
    `Network: BNB Smart Chain Testnet (${EXPECTED_CHAIN_ID})`
);

console.log(
    `Block before: ${blockBefore}`
);

console.log(
    `Block after: ${blockAfter}`
);

console.log(
    `Payment token: ${EXPECTED_TOKEN}`
);

console.log(
    `Payment amount: ${formatUnits(
        challengeAmount,
        tokenDecimals
    )} ${tokenSymbol}`
);

console.log(
    `Payment tx: ${paymentHash}`
);

console.log(
    `Receipt tx: ${decodedReceipt.reference}`
);

console.log(
    `Payer token decrease: ${formatUnits(
        payerTokenDelta,
        tokenDecimals
    )} ${tokenSymbol}`
);

console.log(
    `Merchant token increase: ${formatUnits(
        merchantTokenDelta,
        tokenDecimals
    )} ${tokenSymbol}`
);

console.log(
    `Payer tBNB before: ${formatEther(
        payerGasBefore
    )}`
);

console.log(
    `Payer tBNB after: ${formatEther(
        payerGasAfter
    )}`
);

console.log(
    ""
);

console.log(
    "REAL HTTP 402: true"
);

console.log(
    "REAL ERC20 PAYMENT: true"
);

console.log(
    "STRICT_FROM VERIFIED: true"
);

console.log(
    "REAL PAYMENT RECEIPT: true"
);

console.log(
    "RECEIPT MATCHES TX HASH: true"
);

console.log(
    "REAL PAID RPC EXECUTION: true"
);

console.log(
    "PRIVATE KEY PRINTED: false"
);

console.log(
    ""
);

console.log(
    "STATUS: REAL_MPP_PAYMENT_VERIFIED"
);