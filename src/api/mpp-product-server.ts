import {
    randomUUID,
} from "node:crypto";

import {
    readFile,
} from "node:fs/promises";

import {
    createServer,
    type IncomingMessage,
    type ServerResponse,
} from "node:http";

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

import {
    z,
} from "zod";

import {
    getTransactionAgentModel,
    runTransactionAgent,
    TRANSACTION_AGENT_CHAIN_ID,
    TRANSACTION_AGENT_METHOD,
    TRANSACTION_AGENT_NETWORK,
    TRANSACTION_AGENT_TOOL_ID,
    type TransactionAgentActivity,
} from "../agent/transaction-agent.js";

import {
    getToolRequestHash,
    type ToolRequest,
} from "../core/request-bound.js";

import {
    normalizeTransactionInput,
} from "../chain/transaction-intelligence.js";

import {
    normalizeUniversalTransactionInput,
} from "../chain/universal-transaction-input.js";

import {
    fetchUniversalTransactionFacts,
} from "../chain/universal-transaction-intelligence.js";

import {
    resolveContractIntelligence,
} from "../chain/contract-intelligence.js";

import {
    interpretTransaction,
} from "../chain/transaction-interpretation.js";

import {
    translateLensText,
} from "../chain/lens-translation.js";

import {
    deriveInitialAgentObservations,
} from "../agent/agent-observation.js";

import {
    runAgentRuntime,
} from "../agent/agent-runtime.js";

import {
    buildTransactionAnalysisIntent,
    buildTransactionAnalysisToolRequest,
} from "../core/intent-manifest.js";

import {
    buildWhatChangedReport,
} from "../core/what-changed.js";

import {
    buildGuardAuthorizationDraft,
    buildRuntimeGuardPlanRecord,
} from "../core/guard-handoff.js";

import {
    MPP_REQUEST_AUTHORIZATION_VERSION,
    buildMppRequestAuthorizationTypedData,
    verifyMppRequestBoundPayment,
    verifySignedMppRequestAuthorization,
    type MppPaymentChallenge,
    type MppRequestAuthorization,
    type SignedMppRequestAuthorization,
} from "../core/mpp-request-bound.js";

/*
 * =======================================================
 * BOUND — PRODUCT API
 * =======================================================
 *
 * Product flow:
 *
 * 1. User gives Gemini a transaction-analysis task.
 * 2. Gemini proposes the exact semantic tool request.
 * 3. BOUND canonicalizes + hashes that request host-side.
 * 4. Server fetches a REAL BNB MPP HTTP 402 challenge.
 * 5. Browser reviews the exact request + payment terms.
 * 6. Browser wallet signs request-bound EIP-712 data.
 * 7. Server verifies the wallet signature.
 * 8. At execution time a fresh actual request and fresh
 *    MPP challenge reach the BOUND payment boundary.
 * 9. BOUND verifies the exact request BEFORE payer signing.
 * 10. Only an ALLOW result can reach protected payer code.
 * 11. Payer sends real TEST_USDT on BSC Testnet.
 * 12. Official MPP hash credential is submitted.
 * 13. Paid tool returns live BSC Testnet RPC result.
 *
 * The browser NEVER receives:
 *
 * - GEMINI_API_KEY
 * - payer private key
 * - local protected key files
 *
 * Real payment execution is additionally protected by:
 *
 *   BOUND_ALLOW_REAL_PAYMENT=YES
 *
 * and the browser must explicitly submit:
 *
 *   confirmRealPayment: true
 */

/*
 * =======================================================
 * CONFIGURATION
 * =======================================================
 */

const HOST =
    process.env.BOUND_API_HOST ??
    "127.0.0.1";

const PORT =
    Number(
        process.env.BOUND_API_PORT ??
        "8791"
    );

const TOOL_URL =
    process.env.BOUND_MPP_TOOL_URL ??
    "http://127.0.0.1:8788";

const BSC_RPC_URL =
    process.env.BOUND_BSC_TESTNET_RPC ??
    process.env.BSC_TESTNET_RPC ??
    "https://bsc-testnet-dataseed.bnbchain.org";

const PAYER_PRIVATE_KEY_PATH =
    process.env.BOUND_AGENT_PRIVATE_KEY_PATH ??
    ".bound/agent/private-key";

const REAL_PAYMENT_ENABLED =
    process.env.BOUND_ALLOW_REAL_PAYMENT ===
    "YES";

const EXPECTED_CHAIN_ID =
    97;

const EXPECTED_PAYMENT_TOKEN =
    getAddress(
        "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd"
    );

const EXPECTED_PAYMENT_RECIPIENT =
    getAddress(
        process.env.BOUND_MPP_RECIPIENT ??
        "0x32438de3179df205c63e8793A20BA6885762f537"
    );

const PAYMENT_TOKEN_DISPLAY_NAME =
    "TEST_USDT";

const MAX_PAYMENT_RAW =
    1_000_000_000_000_000n;

const PLAN_LIFETIME_MS =
    10 *
    60 *
    1000;

const AUTHORIZATION_DRAFT_LIFETIME_MS =
    5 *
    60 *
    1000;

const USER_AUTHORIZATION_LIFETIME_MS =
    5 *
    60 *
    1000;

const CONFIRMED_RECORD_RETENTION_MS =
    60 *
    60 *
    1000;

const MAX_REQUEST_BODY_BYTES =
    64 *
    1024;

const CONTROLLED_MUTATED_TRANSACTION_HASH =
    "0x2222222222222222222222222222222222222222222222222222222222222222";

const FINAL_GUARDED_PAYMENT_TX =
    "0x4185b1cb8dea410022833f66443230ebda0548178a18f10c92b635b44ee37450";

const DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
];

const configuredAllowedOrigins =
    (
        process.env
            .BOUND_ALLOWED_ORIGINS ??
        ""
    )
        .split(
            ","
        )
        .map(
            (
                value
            ) =>
                value.trim()
        )
        .filter(
            Boolean
        );

const ALLOWED_ORIGINS =
    new Set([
        ...DEFAULT_ALLOWED_ORIGINS,
        ...configuredAllowedOrigins,
    ]);

const erc20Abi =
    parseAbi([
        "function transfer(address to, uint256 amount) returns (bool)",
        "function balanceOf(address account) view returns (uint256)",
        "function decimals() view returns (uint8)",
        "function symbol() view returns (string)",
    ]);

/*
 * =======================================================
 * API INPUT SCHEMAS
 * =======================================================
 */

const transactionInspectRequestSchema =
    z.object({
        input:
            z.string()
                .trim()
                .min(
                    1
                )
                .max(
                    500
                ),
    });

const lensTranslationRequestSchema =
    z.object({
        text:
            z.string()
              .trim()
              .min(
                    1
                )
              .max(
                    5_000
                ),

        targetLanguage:
            z.string()
              .trim()
              .min(
                    2
                )
              .max(
                    64
                ),

        protectedTerms:
            z.array(
                z.string()
                  .trim()
                  .min(
                        1
                    )
                  .max(
                        200
                    )
            )
              .max(
                    100
                )
              .optional(),
    });

const lensAgentRequestSchema =
    z.object({
        input:
            z.string()
                .trim()
                .min(
                    1
                )
                .max(
                    500
                ),

        question:
            z.string()
                .trim()
                .min(
                    1
                )
                .max(
                    2_000
                ),
    })
        .strict();


const planRequestSchema =
    z.object({
        task:
            z.string()
                .trim()
                .min(
                    1
                )
                .max(
                    2_000
                ),
    });

const prepareAuthorizationRequestSchema =
    z.object({
        planId:
            z.string()
                .uuid(),

        walletAddress:
            z.string()
                .min(
                    1
                ),
    });

const confirmAuthorizationRequestSchema =
    z.object({
        authorizationId:
            z.string()
                .uuid(),

        signature:
            z.string()
                .regex(
                    /^0x[0-9a-fA-F]{130}$/
                ),
    });

const executeRequestSchema =
    z.object({
        authorizationId:
            z.string()
                .uuid(),

        scenario:
            z.enum([
                "normal",
                "tampered",
            ])
                .optional()
                .default(
                    "normal"
                ),

        confirmRealPayment:
            z.boolean()
                .optional()
                .default(
                    false
                ),
    });

/*
 * =======================================================
 * MPP CHALLENGE TYPES
 * =======================================================
 */

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

type MppChallengeBundle = {
    url:
    string;

    challenge:
    ReturnType<
        typeof Challenge.fromResponse
    >;

    payment:
    MppPaymentChallenge;

    challengeId:
    string;
};

/*
 * =======================================================
 * PAID TOOL RESULT
 * =======================================================
 */

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
 * SERVER RECORDS
 * =======================================================
 */

type PlanRecord = {
    id:
    string;

    createdAt:
    number;

    expiresAt:
    number;

    task:
    string;

    model:
    string;

    summary:
    string;

    request:
    ToolRequest;

    requestHash:
    `0x${string}`;

    activity:
    TransactionAgentActivity[];
};

type AuthorizationDraftRecord = {
    id:
    string;

    planId:
    string;

    createdAt:
    number;

    expiresAt:
    number;

    expectedSigner:
    `0x${string}`;

    request:
    ToolRequest;

    requestHash:
    `0x${string}`;

    authorization:
    MppRequestAuthorization;

    quotedPayment:
    MppPaymentChallenge;

    quotedChallengeId:
    string;
};

type ExecutionState =
    | "unused"
    | "inflight"
    | "broadcast"
    | "completed";

type ConfirmedAuthorizationRecord = {
    id:
    string;

    planId:
    string;

    confirmedAt:
    number;

    retainUntil:
    number;

    expectedSigner:
    `0x${string}`;

    request:
    ToolRequest;

    requestHash:
    `0x${string}`;

    signedAuthorization:
    SignedMppRequestAuthorization;

    authorization:
    MppRequestAuthorization;

    quotedPayment:
    MppPaymentChallenge;

    quotedChallengeId:
    string;

    executionState:
    ExecutionState;

    paymentTxHash:
    `0x${string}` |
    null;
};

const plans =
    new Map<
        string,
        PlanRecord
    >();

const authorizationDrafts =
    new Map<
        string,
        AuthorizationDraftRecord
    >();

const confirmedAuthorizations =
    new Map<
        string,
        ConfirmedAuthorizationRecord
    >();

/*
 * =======================================================
 * ERRORS
 * =======================================================
 */

class HttpError extends Error {
    readonly statusCode:
        number;

    readonly code:
        string;

    readonly details?:
        unknown;

    constructor(
        statusCode:
            number,
        code:
            string,
        message:
            string,
        details?:
            unknown
    ) {
        super(
            message
        );

        this.name =
            "HttpError";

        this.statusCode =
            statusCode;

        this.code =
            code;

        this.details =
            details;
    }
}

/*
 * =======================================================
 * PUBLIC BSC CLIENT
 * =======================================================
 */

const publicClient =
    createPublicClient({
        chain:
            bscTestnet,

        transport:
            http(
                BSC_RPC_URL
            ),
    });

/*
 * =======================================================
 * HTTP HELPERS
 * =======================================================
 */

function getOrigin(
    request:
        IncomingMessage
):
    string |
    null {
    const origin =
        request.headers
            .origin;

    if (
        !origin ||
        !ALLOWED_ORIGINS.has(
            origin
        )
    ) {
        return null;
    }

    return origin;
}

function setCommonHeaders(
    request:
        IncomingMessage,
    response:
        ServerResponse
) {
    response.setHeader(
        "Content-Type",
        "application/json; charset=utf-8"
    );

    response.setHeader(
        "Cache-Control",
        "no-store"
    );

    response.setHeader(
        "X-Content-Type-Options",
        "nosniff"
    );

    const origin =
        getOrigin(
            request
        );

    if (
        origin
    ) {
        response.setHeader(
            "Access-Control-Allow-Origin",
            origin
        );

        response.setHeader(
            "Vary",
            "Origin"
        );

        response.setHeader(
            "Access-Control-Allow-Headers",
            "content-type"
        );

        response.setHeader(
            "Access-Control-Allow-Methods",
            "GET,POST,OPTIONS"
        );
    }
}

function sendJson(
    request:
        IncomingMessage,
    response:
        ServerResponse,
    statusCode:
        number,
    data:
        unknown
) {
    setCommonHeaders(
        request,
        response
    );

    response.statusCode =
        statusCode;

    response.end(
        JSON.stringify(
            data,
            null,
            2
        )
    );
}

async function readJsonBody(
    request:
        IncomingMessage
):
    Promise<unknown> {
    let body =
        "";

    for await (
        const chunk of
        request
    ) {
        body +=
            chunk.toString();

        if (
            Buffer.byteLength(
                body
            ) >
            MAX_REQUEST_BODY_BYTES
        ) {
            throw new HttpError(
                413,
                "REQUEST_BODY_TOO_LARGE",
                "The request body is too large."
            );
        }
    }

    if (
        body.trim() ===
        ""
    ) {
        return {};
    }

    try {
        return JSON.parse(
            body
        ) as unknown;
    } catch {
        throw new HttpError(
            400,
            "INVALID_JSON",
            "The request body is not valid JSON."
        );
    }
}

function getRequestUrl(
    request:
        IncomingMessage
) {
    return new URL(
        request.url ??
        "/",
        `http://${request.headers.host ?? "127.0.0.1"}`
    );
}

/*
 * =======================================================
 * RECORD CLEANUP
 * =======================================================
 */

function removeExpiredRecords() {
    const now =
        Date.now();

    for (
        const [
            id,
            record,
        ] of plans
    ) {
        if (
            record.expiresAt <=
            now
        ) {
            plans.delete(
                id
            );
        }
    }

    for (
        const [
            id,
            record,
        ] of authorizationDrafts
    ) {
        if (
            record.expiresAt <=
            now
        ) {
            authorizationDrafts.delete(
                id
            );
        }
    }

    for (
        const [
            id,
            record,
        ] of confirmedAuthorizations
    ) {
        if (
            record.retainUntil <=
            now &&
            record.executionState ===
            "unused"
        ) {
            confirmedAuthorizations.delete(
                id
            );
        }
    }
}

function getPlan(
    planId:
        string
):
    PlanRecord {
    removeExpiredRecords();

    const record =
        plans.get(
            planId
        );

    if (
        !record
    ) {
        throw new HttpError(
            404,
            "PLAN_NOT_FOUND",
            "The transaction plan does not exist or has expired."
        );
    }

    return record;
}

function getAuthorizationDraft(
    authorizationId:
        string
):
    AuthorizationDraftRecord {
    removeExpiredRecords();

    const record =
        authorizationDrafts.get(
            authorizationId
        );

    if (
        !record
    ) {
        throw new HttpError(
            404,
            "AUTHORIZATION_DRAFT_NOT_FOUND",
            "The authorization draft does not exist or has expired."
        );
    }

    return record;
}

function getConfirmedAuthorization(
    authorizationId:
        string
):
    ConfirmedAuthorizationRecord {
    removeExpiredRecords();

    const record =
        confirmedAuthorizations.get(
            authorizationId
        );

    if (
        !record
    ) {
        throw new HttpError(
            404,
            "CONFIRMED_AUTHORIZATION_NOT_FOUND",
            "The confirmed authorization does not exist or has expired."
        );
    }

    return record;
}

/*
 * =======================================================
 * TOOL REQUEST HELPERS
 * =======================================================
 */

type TransactionAnalysisArguments = {
    chainId:
        number;

    transactionHash:
        `0x${string}`;
};

function parseTransactionAnalysisArguments(
    request:
        ToolRequest
):
    TransactionAnalysisArguments {
    if (
        request.toolId !==
        TRANSACTION_AGENT_TOOL_ID
    ) {
        throw new HttpError(
            400,
            "INVALID_TOOL_ID",
            "The paid request must target BOUND transaction analysis."
        );
    }

    if (
        request.method !==
        TRANSACTION_AGENT_METHOD
    ) {
        throw new HttpError(
            400,
            "INVALID_TOOL_METHOD",
            "The paid request must use the transaction-analysis method."
        );
    }

    if (
        typeof request.arguments !==
        "object" ||
        request.arguments ===
        null ||
        Array.isArray(
            request.arguments
        )
    ) {
        throw new HttpError(
            500,
            "INVALID_INTERNAL_TOOL_REQUEST",
            "The internal transaction-analysis request has invalid arguments."
        );
    }

    const args =
        request.arguments as
        Record<
            string,
            unknown
        >;

    if (
        args.chainId !==
        EXPECTED_CHAIN_ID
    ) {
        throw new HttpError(
            400,
            "INVALID_TOOL_CHAIN",
            "The transaction-analysis request must use BSC Testnet chain ID 97."
        );
    }

    if (
        typeof args.transactionHash !==
        "string"
    ) {
        throw new HttpError(
            400,
            "INVALID_TRANSACTION_HASH",
            "The transaction-analysis request is missing a transaction hash."
        );
    }

    let normalized;

    try {
        normalized =
            normalizeTransactionInput(
                args.transactionHash
            );
    } catch {
        throw new HttpError(
            400,
            "INVALID_TRANSACTION_HASH",
            "The transaction-analysis request contains an invalid BSC Testnet transaction hash."
        );
    }

    return {
        chainId:
            EXPECTED_CHAIN_ID,

        transactionHash:
            normalized.hash,
    };
}

function buildProtectedToolUrl(
    request:
        ToolRequest
):
    string {
    const args =
        parseTransactionAnalysisArguments(
            request
        );

    const url =
        new URL(
            "/api/transaction-analysis",
            TOOL_URL
        );

    url.searchParams.set(
        "transactionHash",
        args.transactionHash
    );

    return url.toString();
}

function makeTamperedRequest(
    authorizedRequest:
        ToolRequest
):
    ToolRequest {
    /*
     * Validate the original request first.
     */
    parseTransactionAnalysisArguments(
        authorizedRequest
    );

    /*
     * Controlled mutation:
     *
     * Only the semantic transaction target changes.
     * Tool, method, chain, merchant, token, amount and
     * credential type remain unchanged.
     */
    return buildTransactionAnalysisToolRequest(
        CONTROLLED_MUTATED_TRANSACTION_HASH
    );
}

/*
 * =======================================================
 * MPP CHALLENGE PARSING
 * =======================================================
 */

function parseMppChargeRequest(
    value:
        unknown
):
    MppChargeRequest {
    if (
        typeof value !==
        "object" ||
        value ===
        null
    ) {
        throw new HttpError(
            502,
            "INVALID_MPP_CHALLENGE",
            "The MPP challenge request is not an object."
        );
    }

    const request =
        value as
        Record<
            string,
            unknown
        >;

    if (
        typeof request.amount !==
        "string" ||
        !/^(0|[1-9]\d*)$/.test(
            request.amount
        )
    ) {
        throw new HttpError(
            502,
            "INVALID_MPP_AMOUNT",
            "The MPP challenge contains an invalid amount."
        );
    }

    if (
        typeof request.currency !==
        "string" ||
        !isAddress(
            request.currency
        )
    ) {
        throw new HttpError(
            502,
            "INVALID_MPP_CURRENCY",
            "The MPP challenge contains an invalid payment token."
        );
    }

    if (
        typeof request.recipient !==
        "string" ||
        !isAddress(
            request.recipient
        )
    ) {
        throw new HttpError(
            502,
            "INVALID_MPP_RECIPIENT",
            "The MPP challenge contains an invalid payment recipient."
        );
    }

    if (
        typeof request.methodDetails !==
        "object" ||
        request.methodDetails ===
        null
    ) {
        throw new HttpError(
            502,
            "INVALID_MPP_METHOD_DETAILS",
            "The MPP challenge is missing methodDetails."
        );
    }

    const details =
        request.methodDetails as
        Record<
            string,
            unknown
        >;

    if (
        typeof details.chainId !==
        "number"
    ) {
        throw new HttpError(
            502,
            "INVALID_MPP_CHAIN",
            "The MPP challenge contains an invalid chainId."
        );
    }

    const credentialTypes =
        Array.isArray(
            details.credentialTypes
        )
            ? details
                .credentialTypes
                .filter(
                    (
                        value
                    ): value is string =>
                        typeof value ===
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

function toBoundMppChallenge(
    request:
        MppChargeRequest
):
    MppPaymentChallenge {
    return {
        chainId:
            request
                .methodDetails
                .chainId,

        currency:
            getAddress(
                request.currency
            ),

        recipient:
            getAddress(
                request.recipient
            ),

        amount:
            request.amount,

        credentialTypes:
            request
                .methodDetails
                .credentialTypes ??
            [],
    };
}

function verifyKnownPaymentPolicy(
    challenge:
        MppPaymentChallenge
) {
    if (
        challenge.chainId !==
        EXPECTED_CHAIN_ID
    ) {
        throw new HttpError(
            502,
            "UNEXPECTED_MPP_CHAIN",
            `MPP requested chain ${challenge.chainId}; expected ${EXPECTED_CHAIN_ID}.`
        );
    }

    if (
        challenge.currency
            .toLowerCase() !==
        EXPECTED_PAYMENT_TOKEN
            .toLowerCase()
    ) {
        throw new HttpError(
            502,
            "UNEXPECTED_MPP_TOKEN",
            `MPP requested unexpected token ${challenge.currency}.`
        );
    }

    if (
        challenge.recipient
            .toLowerCase() !==
        EXPECTED_PAYMENT_RECIPIENT
            .toLowerCase()
    ) {
        throw new HttpError(
            502,
            "UNEXPECTED_MPP_RECIPIENT",
            `MPP requested unexpected recipient ${challenge.recipient}.`
        );
    }

    const amount =
        BigInt(
            challenge.amount
        );

    if (
        amount <=
        0n
    ) {
        throw new HttpError(
            502,
            "INVALID_MPP_PAYMENT_AMOUNT",
            "MPP requested a non-positive payment amount."
        );
    }

    if (
        amount >
        MAX_PAYMENT_RAW
    ) {
        throw new HttpError(
            502,
            "MPP_PAYMENT_ABOVE_CAP",
            "MPP requested a payment above BOUND's configured integration cap."
        );
    }

    if (
        !challenge
            .credentialTypes
            .includes(
                "hash"
            )
    ) {
        throw new HttpError(
            502,
            "MPP_HASH_CREDENTIAL_UNAVAILABLE",
            "MPP challenge does not accept a hash credential."
        );
    }
}

async function fetchMppChallenge(
    request:
        ToolRequest
):
    Promise<
        MppChallengeBundle
    > {
    const url =
        buildProtectedToolUrl(
            request
        );

    const response =
        await fetch(
            url,
            {
                redirect:
                    "error",
            }
        );

    if (
        response.status !==
        402
    ) {
        const body =
            await response
                .text();

        throw new HttpError(
            502,
            "MPP_402_EXPECTED",
            `Protected tool returned HTTP ${response.status} instead of 402.`,
            {
                body,
            }
        );
    }

    if (
        !response.headers
            .get(
                "www-authenticate"
            )
    ) {
        throw new HttpError(
            502,
            "MPP_AUTHENTICATE_HEADER_MISSING",
            "The protected tool returned 402 without WWW-Authenticate."
        );
    }

    const challenge =
        Challenge.fromResponse(
            response
        );

    if (
        challenge.method !==
        "evm"
    ) {
        throw new HttpError(
            502,
            "UNEXPECTED_MPP_METHOD",
            `MPP returned method ${challenge.method}; expected evm.`
        );
    }

    if (
        challenge.intent !==
        "charge"
    ) {
        throw new HttpError(
            502,
            "UNEXPECTED_MPP_INTENT",
            `MPP returned intent ${challenge.intent}; expected charge.`
        );
    }

    if (
        challenge.expires &&
        Date.parse(
            challenge.expires
        ) <=
        Date.now()
    ) {
        throw new HttpError(
            502,
            "MPP_CHALLENGE_EXPIRED",
            "The MPP challenge is already expired."
        );
    }

    const chargeRequest =
        parseMppChargeRequest(
            challenge.request
        );

    const payment =
        toBoundMppChallenge(
            chargeRequest
        );

    verifyKnownPaymentPolicy(
        payment
    );

    return {
        url,

        challenge,

        payment,

        challengeId:
            challenge.id,
    };
}

/*
 * =======================================================
 * PAYMENT TERM PRESENTATION
 * =======================================================
 */

function paymentTermsComparison(
    quoted:
        MppPaymentChallenge,
    actual:
        MppPaymentChallenge
) {
    return {
        sameChain:
            quoted.chainId ===
            actual.chainId,

        sameToken:
            quoted.currency
                .toLowerCase() ===
            actual.currency
                .toLowerCase(),

        sameRecipient:
            quoted.recipient
                .toLowerCase() ===
            actual.recipient
                .toLowerCase(),

        sameAmount:
            quoted.amount ===
            actual.amount,

        sameCredentialType:
            quoted
                .credentialTypes
                .includes(
                    "hash"
                ) &&
            actual
                .credentialTypes
                .includes(
                    "hash"
                ),
    };
}

function publicPaymentTerms(
    challenge:
        MppPaymentChallenge
) {
    return {
        protocol:
            "BNB MPP",

        network:
            TRANSACTION_AGENT_NETWORK,

        chainId:
            challenge.chainId,

        token:
            PAYMENT_TOKEN_DISPLAY_NAME,

        tokenContract:
            challenge.currency,

        recipient:
            challenge.recipient,

        amountRaw:
            challenge.amount,

        amount:
            formatUnits(
                BigInt(
                    challenge.amount
                ),
                18
            ),

        credentialType:
            "hash",
    };
}

/*
 * =======================================================
 * BROWSER EIP-712 PAYLOAD
 * =======================================================
 */

function buildBrowserTypedData(
    authorization:
        MppRequestAuthorization
) {
    const typedData =
        buildMppRequestAuthorizationTypedData(
            authorization
        );

    const message =
        Object.fromEntries(
            Object.entries(
                typedData.message
            )
                .map(
                    ([
                        key,
                        value,
                    ]) => [
                            key,

                            typeof value ===
                                "bigint"
                                ? value.toString()
                                : value,
                        ]
                )
        );

    return {
        domain:
            typedData.domain,

        primaryType:
            typedData.primaryType,

        types: {
            EIP712Domain: [
                {
                    name:
                        "name",

                    type:
                        "string",
                },

                {
                    name:
                        "version",

                    type:
                        "string",
                },

                {
                    name:
                        "chainId",

                    type:
                        "uint256",
                },
            ],

            ...typedData.types,
        },

        message,
    };
}

/*
 * Register an exact paid request produced by the bounded
 * runtime directly into the existing Guard plan store.
 *
 * No model is called here. The request is normalized and
 * hashed host-side before human authorization begins.
 */
function registerRuntimeGuardPlan(
    input: {
        task:
            string;

        request:
            unknown;

        model:
            string;

        summary:
            string;
    }
) {
    const now =
        Date.now();

    const id =
        randomUUID();

    const record:
        PlanRecord =
        buildRuntimeGuardPlanRecord({
            id,

            now,

            lifetimeMs:
                PLAN_LIFETIME_MS,

            task:
                input.task,

            request:
                input.request,

            model:
                input.model,

            summary:
                input.summary,

            /*
             * This plan came from the autonomous runtime,
             * not the legacy transaction-agent planner.
             */
            activity: [],
        });

    plans.set(
        id,
        record
    );

    return {
        status:
            "PROPOSED" as const,

        planId:
            id,

        createdAt:
            record.createdAt,

        expiresAt:
            record.expiresAt,

        model:
            record.model,

        task:
            record.task,

        summary:
            record.summary,

        network:
            TRANSACTION_AGENT_NETWORK,

        request:
            record.request,

        requestHash:
            record.requestHash,

        activity:
            record.activity,
    };
}


/*
 * =======================================================
 * PLAN
 * =======================================================
 */

async function createPlan(
    task:
        string
) {
    const result =
        await runTransactionAgent({
            task,
        });

    if (
        result.status ===
        "NO_PROPOSAL"
    ) {
        return {
            status:
                "NO_PROPOSAL" as const,

            model:
                result.model,

            task:
                result.task,

            message:
                result.message,

            activity:
                result.activity,
        };
    }

    const now =
        Date.now();

    const id =
        randomUUID();

    const record:
        PlanRecord = {
        id,

        createdAt:
            now,

        expiresAt:
            now +
            PLAN_LIFETIME_MS,

        task:
            result.task,

        model:
            result.model,

        summary:
            result.summary,

        request:
            result.request,

        requestHash:
            result.requestHash,

        activity:
            result.activity,
    };

    plans.set(
        id,
        record
    );

    return {
        status:
            "PROPOSED" as const,

        planId:
            id,

        createdAt:
            record.createdAt,

        expiresAt:
            record.expiresAt,

        model:
            record.model,

        task:
            record.task,

        summary:
            record.summary,

        network:
            TRANSACTION_AGENT_NETWORK,

        request:
            record.request,

        requestHash:
            record.requestHash,

        activity:
            record.activity,
    };
}

/*
 * =======================================================
 * PREPARE AUTHORIZATION
 * =======================================================
 */

async function prepareAuthorization(
    planId:
        string,
    rawWalletAddress:
        string
) {
    const plan =
        getPlan(
            planId
        );

    let expectedSigner:
        `0x${string}`;

    try {
        expectedSigner =
            getAddress(
                rawWalletAddress
            );
    } catch {
        throw new HttpError(
            400,
            "INVALID_WALLET_ADDRESS",
            "The connected wallet address is not a valid EVM address."
        );
    }

    /*
     * Fetch a real MPP quote.
     *
     * This generates an HTTP 402 challenge but sends no
     * blockchain transaction.
     */
    const quote =
        await fetchMppChallenge(
            plan.request
        );

    const now =
        Date.now();

    const authorizationId =
        randomUUID();

    /*
     * The browser signs the exact quoted amount.
     *
     * Draft construction is pure and shared with the
     * continuity regression test. Fetching the real MPP
     * challenge remains outside this builder.
     */
    const {
        draft,
        authorization,
    } =
        buildGuardAuthorizationDraft({
            plan,

            expectedSigner,

            quote: {
                payment:
                    quote.payment,

                challengeId:
                    quote.challengeId,
            },

            authorizationId,

            now,

            draftLifetimeMs:
                AUTHORIZATION_DRAFT_LIFETIME_MS,

            userAuthorizationLifetimeMs:
                USER_AUTHORIZATION_LIFETIME_MS,
        });

    authorizationDrafts.set(
        authorizationId,
        draft
    );

    return {
        authorizationId,

        planId:
            plan.id,

        createdAt:
            now,

        draftExpiresAt:
            draft.expiresAt,

        expectedSigner,

        request:
            plan.request,

        requestHash:
            plan.requestHash,

        payment:
            publicPaymentTerms(
                quote.payment
            ),

        authorization,

        typedData:
            buildBrowserTypedData(
                authorization
            ),

        note:
            "No payment has been sent. This signature authorizes only the exact request and payment terms shown above.",
    };
}

/*
 * =======================================================
 * CONFIRM AUTHORIZATION
 * =======================================================
 */

async function confirmAuthorization(
    authorizationId:
        string,
    signature:
        string
) {
    const draft =
        getAuthorizationDraft(
            authorizationId
        );

    if (
        draft.expiresAt <=
        Date.now()
    ) {
        throw new HttpError(
            410,
            "AUTHORIZATION_DRAFT_EXPIRED",
            "The authorization draft has expired."
        );
    }

    const envelope:
        SignedMppRequestAuthorization = {
        version:
            MPP_REQUEST_AUTHORIZATION_VERSION,

        signer:
            draft.expectedSigner,

        authorization:
            draft.authorization,

        signature,
    };

    const verification =
        await verifySignedMppRequestAuthorization({
            envelope,

            expectedSigner:
                draft.expectedSigner,
        });

    if (
        !verification.valid
    ) {
        throw new HttpError(
            400,
            verification.code,
            verification.message
        );
    }

    const now =
        Date.now();

    const confirmed:
        ConfirmedAuthorizationRecord = {
        id:
            draft.id,

        planId:
            draft.planId,

        confirmedAt:
            now,

        retainUntil:
            now +
            CONFIRMED_RECORD_RETENTION_MS,

        expectedSigner:
            draft.expectedSigner,

        request:
            draft.request,

        requestHash:
            draft.requestHash,

        signedAuthorization:
            envelope,

        authorization:
            draft.authorization,

        quotedPayment:
            draft.quotedPayment,

        quotedChallengeId:
            draft.quotedChallengeId,

        executionState:
            "unused",

        paymentTxHash:
            null,
    };

    confirmedAuthorizations.set(
        confirmed.id,
        confirmed
    );

    authorizationDrafts.delete(
        draft.id
    );

    return {
        confirmed:
            true,

        authorizationId:
            confirmed.id,

        planId:
            confirmed.planId,

        confirmedAt:
            confirmed.confirmedAt,

        signer:
            confirmed.expectedSigner,

        request:
            confirmed.request,

        requestHash:
            confirmed.requestHash,

        payment:
            publicPaymentTerms(
                confirmed.quotedPayment
            ),

        authorization:
            confirmed.authorization,

        executionState:
            confirmed.executionState,
    };
}

/*
 * =======================================================
 * PAYER KEY
 * =======================================================
 */

async function loadPayerAccount() {
    const raw =
        (
            await readFile(
                PAYER_PRIVATE_KEY_PATH,
                "utf8"
            )
        ).trim();

    if (
        !/^0x[0-9a-fA-F]{64}$/.test(
            raw
        )
    ) {
        throw new HttpError(
            500,
            "INVALID_PAYER_PRIVATE_KEY",
            "The protected payer key file has an invalid format."
        );
    }

    return privateKeyToAccount(
        raw as Hex
    );
}

/*
 * =======================================================
 * TOKEN BALANCE
 * =======================================================
 */

async function getTokenBalance(
    address:
        `0x${string}`
) {
    return publicClient
        .readContract({
            address:
                EXPECTED_PAYMENT_TOKEN,

            abi:
                erc20Abi,

            functionName:
                "balanceOf",

            args: [
                address,
            ],
        });
}

/*
 * =======================================================
 * BLOCK / READY RESULT
 * =======================================================
 */

async function getNoPaymentAudit(
    payerAddress?:
        `0x${string}`
) {
    if (
        !payerAddress
    ) {
        return {
            payerTokenDeltaRaw:
                "0",

            merchantTokenDeltaRaw:
                "0",
        };
    }

    const [
        payerBefore,
        merchantBefore,
    ] =
        await Promise.all([
            getTokenBalance(
                payerAddress
            ),

            getTokenBalance(
                EXPECTED_PAYMENT_RECIPIENT
            ),
        ]);

    /*
     * No write can occur between these reads in this path.
     * A second read makes the zero-delta claim observable.
     */
    const [
        payerAfter,
        merchantAfter,
    ] =
        await Promise.all([
            getTokenBalance(
                payerAddress
            ),

            getTokenBalance(
                EXPECTED_PAYMENT_RECIPIENT
            ),
        ]);

    return {
        payerTokenDeltaRaw:
            (
                payerAfter -
                payerBefore
            ).toString(),

        merchantTokenDeltaRaw:
            (
                merchantAfter -
                merchantBefore
            ).toString(),
    };
}

/*
 * =======================================================
 * EXECUTION
 * =======================================================
 */

async function executeAuthorization(
    record:
        ConfirmedAuthorizationRecord,
    scenario:
        "normal" |
        "tampered",
    confirmRealPayment:
        boolean
) {
    if (
        record.authorization
            .validUntil <=
        Date.now()
    ) {
        throw new HttpError(
            410,
            "AUTHORIZATION_EXPIRED",
            "The signed request-bound authorization has expired."
        );
    }

    if (
        record.executionState ===
        "completed"
    ) {
        throw new HttpError(
            409,
            "AUTHORIZATION_ALREADY_EXECUTED",
            "This authorization has already completed a payment."
        );
    }

    if (
        record.executionState ===
        "broadcast"
    ) {
        throw new HttpError(
            409,
            "PAYMENT_ALREADY_BROADCAST",
            "A payment transaction was already broadcast for this authorization. Do not retry automatically.",
            {
                paymentTxHash:
                    record.paymentTxHash,
            }
        );
    }

    if (
        record.executionState ===
        "inflight"
    ) {
        throw new HttpError(
            409,
            "EXECUTION_IN_PROGRESS",
            "This authorization is already being executed."
        );
    }

    const actualRequest =
        scenario ===
            "tampered"
            ? makeTamperedRequest(
                record.request
            )
            : record.request;

    const actualRequestHash =
        getToolRequestHash(
            actualRequest
        );

    /*
     * Obtain a fresh real MPP challenge for the actual
     * request reaching the payment boundary.
     *
     * Still no payment has happened.
     */
    const actualChallenge =
        await fetchMppChallenge(
            actualRequest
        );

    const termsComparison =
        paymentTermsComparison(
            record.quotedPayment,
            actualChallenge.payment
        );

    /*
     * CRITICAL SECURITY GATE.
     *
     * Everything capable of signing or broadcasting payment
     * is below this call.
     */
    const bound =
        await verifyMppRequestBoundPayment({
            signedAuthorization:
                record.signedAuthorization,

            expectedAuthorizationSigner:
                record.expectedSigner,

            actualRequest,

            challenge:
                actualChallenge.payment,

            now:
                Date.now(),
        });

    /*
     * Human-readable runtime proof.
     *
     * This is derived from:
     * - the exact request the user authorized,
     * - the actual request reaching the payment boundary,
     * - the fresh real MPP challenge,
     * - the deterministic BOUND Guard result.
     *
     * No LLM participates in this comparison.
     */
    const authorizedArguments =
        parseTransactionAnalysisArguments(
            record.request
        );

    const runtimeIntent =
        buildTransactionAnalysisIntent({
            transactionInput:
                authorizedArguments.transactionHash,

            authorizationId:
                record.authorization.authorizationId,

            paymentToken:
                record.authorization.paymentToken,

            paymentRecipient:
                record.authorization.paymentRecipient,

            maxAmountRaw:
                record.authorization.maxAmountRaw,

            validUntil:
                record.authorization.validUntil,
        });

    const prePaymentWhatChanged =
        buildWhatChangedReport({
            manifest:
                runtimeIntent.manifest,

            actualRequest,

            challenge:
                actualChallenge.payment,

            guard: {
                decision:
                    bound.decision,

                findingCode:
                    bound.findings[0]?.code ??
                    null,

                requestMatches:
                    bound.requestComparison?.matches ??
                    null,
            },

            execution: {
                payerInvoked:
                    false,

                broadcast:
                    false,
            },
        });

    if (
        bound.decision !==
        "ALLOW"
    ) {
        let payerAddress:
            `0x${string}` |
            undefined;

        try {
            const payer =
                await loadPayerAccount();

            payerAddress =
                payer.address;
        } catch {
            /*
             * A blocked request does not need a payer key.
             * We intentionally do not fail the security result
             * merely because the protected payer is unavailable.
             */
        }

        const audit =
            await getNoPaymentAudit(
                payerAddress
            );

        return {
            status:
                "STOPPED" as const,

            scenario,

            message:
                bound.findings[0]?.code ===
                    "REQUEST_PROVENANCE_BREAK"
                    ? "The request changed after authorization. No payment was sent."
                    : "BOUND stopped the paid tool call before payment.",

            request: {
                authorized:
                    record.request,

                actual:
                    actualRequest,

                authorizedRequestHash:
                    record.requestHash,

                actualRequestHash,

                matches:
                    record.requestHash ===
                    actualRequestHash,
            },

            paymentTerms:
                termsComparison,

            verification:
                bound,

            whatChanged:
                prePaymentWhatChanged,

            signerInvoked:
                false,

            paymentSimulationInvoked:
                false,

            paymentBroadcast:
                false,

            paymentTxHash:
                null,

            payerTokenDeltaRaw:
                audit.payerTokenDeltaRaw,

            merchantTokenDeltaRaw:
                audit.merchantTokenDeltaRaw,
        };
    }

    /*
     * The request is valid, but callers can inspect an ALLOW
     * without sending money.
     */
    if (
        !confirmRealPayment
    ) {
        return {
            status:
                "READY" as const,

            scenario,

            message:
                "The exact tool request matches the signed authorization. No payment has been sent.",

            request: {
                authorized:
                    record.request,

                actual:
                    actualRequest,

                authorizedRequestHash:
                    record.requestHash,

                actualRequestHash,

                matches:
                    true,
            },

            payment:
                publicPaymentTerms(
                    actualChallenge.payment
                ),

            paymentTerms:
                termsComparison,

            verification:
                bound,

            whatChanged:
                prePaymentWhatChanged,

            signerInvoked:
                false,

            paymentSimulationInvoked:
                false,

            paymentBroadcast:
                false,

            paymentTxHash:
                null,

            realPaymentEnabled:
                REAL_PAYMENT_ENABLED,
        };
    }

    if (
        !REAL_PAYMENT_ENABLED
    ) {
        throw new HttpError(
            403,
            "REAL_PAYMENT_DISABLED",
            "Real payment execution is disabled. Start the API with BOUND_ALLOW_REAL_PAYMENT=YES only when you intentionally want a BSC Testnet payment."
        );
    }

    /*
     * From this point onward this authorization is reserved
     * against concurrent execution.
     */
    record.executionState =
        "inflight";

    let paymentHash:
        `0x${string}` |
        null =
        null;

    try {
        const payer =
            await loadPayerAccount();

        const walletClient =
            createWalletClient({
                account:
                    payer,

                chain:
                    bscTestnet,

                transport:
                    http(
                        BSC_RPC_URL
                    ),
            });

        const rpcChainId =
            await publicClient
                .getChainId();

        if (
            rpcChainId !==
            EXPECTED_CHAIN_ID
        ) {
            throw new Error(
                `RPC returned chainId ${rpcChainId}; expected ${EXPECTED_CHAIN_ID}.`
            );
        }

        const paymentAmount =
            BigInt(
                actualChallenge
                    .payment
                    .amount
            );

        const [
            payerTokenBefore,
            merchantTokenBefore,
            payerGasBefore,
            tokenDecimals,
            tokenSymbol,
        ] =
            await Promise.all([
                getTokenBalance(
                    payer.address
                ),

                getTokenBalance(
                    EXPECTED_PAYMENT_RECIPIENT
                ),

                publicClient
                    .getBalance({
                        address:
                            payer.address,
                    }),

                publicClient
                    .readContract({
                        address:
                            EXPECTED_PAYMENT_TOKEN,

                        abi:
                            erc20Abi,

                        functionName:
                            "decimals",
                    }),

                publicClient
                    .readContract({
                        address:
                            EXPECTED_PAYMENT_TOKEN,

                        abi:
                            erc20Abi,

                        functionName:
                            "symbol",
                    }),
            ]);

        if (
            payerTokenBefore <
            paymentAmount
        ) {
            throw new Error(
                "Protected payer does not have enough TEST_USDT."
            );
        }

        if (
            payerGasBefore <=
            0n
        ) {
            throw new Error(
                "Protected payer does not have tBNB for gas."
            );
        }

        /*
         * Payment simulation happens only after BOUND ALLOW.
         */
        const simulation =
            await publicClient
                .simulateContract({
                    address:
                        EXPECTED_PAYMENT_TOKEN,

                    abi:
                        erc20Abi,

                    functionName:
                        "transfer",

                    args: [
                        EXPECTED_PAYMENT_RECIPIENT,

                        paymentAmount,
                    ],

                    account:
                        payer,
                });

        const estimatedGas =
            await publicClient
                .estimateContractGas({
                    address:
                        EXPECTED_PAYMENT_TOKEN,

                    abi:
                        erc20Abi,

                    functionName:
                        "transfer",

                    args: [
                        EXPECTED_PAYMENT_RECIPIENT,

                        paymentAmount,
                    ],

                    account:
                        payer.address,
                });

        /*
         * REAL BSC TESTNET PAYMENT.
         */
        paymentHash =
            await walletClient
                .writeContract(
                    simulation.request
                );

        record.paymentTxHash =
            paymentHash;

        record.executionState =
            "broadcast";

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
                `Payment transaction ${paymentHash} reverted.`
            );
        }

        /*
         * BNB MPP hash credential defaults to strict_from.
         */
        const payerSourceDid =
            `did:pkh:eip155:${EXPECTED_CHAIN_ID}:${payer.address}`;

        const credential =
            await createHashCredential({
                challenge:
                    actualChallenge.challenge,

                hash:
                    paymentHash,

                source:
                    payerSourceDid,
            });

        /*
         * Retry the exact same protected request.
         */
        const paidResponse =
            await fetch(
                actualChallenge.url,
                {
                    headers: {
                        Authorization:
                            credential,
                    },

                    redirect:
                        "error",
                }
            );

        if (
            paidResponse.status !==
            200
        ) {
            const body =
                await paidResponse
                    .text();

            throw new Error(
                `Paid tool returned HTTP ${paidResponse.status}. Body: ${body}`
            );
        }

        const receiptHeader =
            paidResponse.headers
                .get(
                    "payment-receipt"
                );

        if (
            !receiptHeader
        ) {
            throw new Error(
                "Paid MPP response did not include Payment-Receipt."
            );
        }

        const decodedReceipt =
            deserializeEvmReceipt(
                receiptHeader
            );

        if (
            decodedReceipt.status !==
            "success"
        ) {
            throw new Error(
                `MPP receipt status is ${decodedReceipt.status}.`
            );
        }

        if (
            decodedReceipt.chainId !==
            EXPECTED_CHAIN_ID
        ) {
            throw new Error(
                `MPP receipt chainId is ${decodedReceipt.chainId}; expected ${EXPECTED_CHAIN_ID}.`
            );
        }

        if (
            typeof decodedReceipt.reference !==
            "string" ||
            decodedReceipt.reference
                .toLowerCase() !==
            paymentHash
                .toLowerCase()
        ) {
            throw new Error(
                "MPP Payment-Receipt reference does not match the payment transaction."
            );
        }

        const paidBody =
            await paidResponse
                .json() as
            PaidToolBody;

        if (
            paidBody.request?.toolId !==
            TRANSACTION_AGENT_TOOL_ID
        ) {
            throw new Error(
                "Paid tool returned an unexpected tool ID."
            );
        }

        if (
            paidBody.request?.method !==
            TRANSACTION_AGENT_METHOD
        ) {
            throw new Error(
                "Paid tool returned an unexpected method."
            );
        }

        if (
            paidBody.request
                ?.requestHash !==
            actualRequestHash
        ) {
            throw new Error(
                "Paid tool requestHash does not match the request BOUND authorized."
            );
        }

        if (
            paidBody.result?.source !==
            "live-bsc-testnet-rpc"
        ) {
            throw new Error(
                "Paid tool result did not come from the live BSC Testnet RPC path."
            );
        }

        if (
            paidBody.result?.chainId !==
            EXPECTED_CHAIN_ID
        ) {
            throw new Error(
                "Paid tool result returned the wrong chain."
            );
        }

        const [
            payerTokenAfter,
            merchantTokenAfter,
            payerGasAfter,
        ] =
            await Promise.all([
                getTokenBalance(
                    payer.address
                ),

                getTokenBalance(
                    EXPECTED_PAYMENT_RECIPIENT
                ),

                publicClient
                    .getBalance({
                        address:
                            payer.address,
                    }),
            ]);

        record.executionState =
            "completed";

        return {
            status:
                "COMPLETED" as const,

            scenario,

            message:
                "The exact request matched the signed authorization, payment completed, and the live tool result was returned.",

            request: {
                authorized:
                    record.request,

                actual:
                    actualRequest,

                authorizedRequestHash:
                    record.requestHash,

                actualRequestHash,

                matches:
                    true,
            },

            payment:
            {
                ...publicPaymentTerms(
                    actualChallenge.payment
                ),

                payer:
                    payer.address,

                payerSourceDid,

                estimatedGasUnits:
                    estimatedGas.toString(),

                txHash:
                    paymentHash,

                confirmedBlock:
                    paymentReceipt
                        .blockNumber
                        .toString(),

                explorerUrl:
                    `https://testnet.bscscan.com/tx/${paymentHash}`,
            },

            paymentTerms:
                termsComparison,

            verification:
                bound,

            receipt: {
                status:
                    decodedReceipt.status,

                chainId:
                    decodedReceipt.chainId,

                reference:
                    decodedReceipt.reference,

                matchesPaymentTx:
                    true,
            },

            toolResult: {
                source:
                    paidBody.result.source,

                network:
                    paidBody.result.network,

                chainId:
                    paidBody.result.chainId,

                blockNumber:
                    paidBody.result.blockNumber,

                checkedTransaction:
                    paidBody.result.checkedTransaction,

                rpcResult:
                    paidBody.result.rpcResult,
            },

            audit: {
                signerInvoked:
                    true,

                paymentSimulationInvoked:
                    true,

                paymentBroadcast:
                    true,

                payerTokenDecrease:
                    formatUnits(
                        payerTokenBefore -
                        payerTokenAfter,
                        tokenDecimals
                    ),

                merchantTokenIncrease:
                    formatUnits(
                        merchantTokenAfter -
                        merchantTokenBefore,
                        tokenDecimals
                    ),

                tokenSymbol,

                payerTbnbBefore:
                    formatEther(
                        payerGasBefore
                    ),

                payerTbnbAfter:
                    formatEther(
                        payerGasAfter
                    ),

                privateKeyPrinted:
                    false,
            },
        };
    } catch (
    error
    ) {
        /*
         * Before broadcast, release the authorization so the
         * user may safely correct a transient local failure.
         *
         * After broadcast, NEVER silently make it executable
         * again. The tx hash is returned for manual inspection.
         */
        if (
            !paymentHash
        ) {
            record.executionState =
                "unused";
        } else {
            record.executionState =
                "broadcast";

            record.paymentTxHash =
                paymentHash;
        }

        return {
            status:
                paymentHash
                    ? "PAYMENT_BROADCAST_BUT_INCOMPLETE"
                    : "EXECUTION_FAILED_BEFORE_PAYMENT",

            scenario,

            message:
                paymentHash
                    ? "A testnet payment was already broadcast, but the paid-tool flow did not finish. Do not retry automatically."
                    : "Execution failed before a payment was broadcast.",

            error:
                error instanceof
                    Error
                    ? error.message
                    : String(
                        error
                    ),

            paymentTxHash:
                paymentHash,

            explorerUrl:
                paymentHash
                    ? `https://testnet.bscscan.com/tx/${paymentHash}`
                    : null,

            retryAutomatically:
                false,
        };
    }
}

/*
 * =======================================================
 * HEALTH
 * =======================================================
 */

async function getHealth() {
    let rpc: {
        reachable:
        boolean;

        chainId:
        number |
        null;

        latestBlock:
        string |
        null;

        error:
        string |
        null;
    };

    try {
        const [
            chainId,
            latestBlock,
        ] =
            await Promise.all([
                publicClient
                    .getChainId(),

                publicClient
                    .getBlockNumber(),
            ]);

        rpc = {
            reachable:
                true,

            chainId,

            latestBlock:
                latestBlock
                    .toString(),

            error:
                null,
        };
    } catch (
    error
    ) {
        rpc = {
            reachable:
                false,

            chainId:
                null,

            latestBlock:
                null,

            error:
                error instanceof
                    Error
                    ? error.message
                    : String(
                        error
                    ),
        };
    }

    return {
        status:
            "ok",

        service:
            "BOUND Product API",

        version:
            "request-bound-mpp",

        port:
            PORT,

        model:
            getTransactionAgentModel(),

        network:
            TRANSACTION_AGENT_NETWORK,

        chainId:
            TRANSACTION_AGENT_CHAIN_ID,

        tool: {
            id:
                TRANSACTION_AGENT_TOOL_ID,

            method:
                TRANSACTION_AGENT_METHOD,

            endpoint:
                TOOL_URL,
        },

        payment: {
            protocol:
                "BNB MPP",

            token:
                PAYMENT_TOKEN_DISPLAY_NAME,

            tokenContract:
                EXPECTED_PAYMENT_TOKEN,

            recipient:
                EXPECTED_PAYMENT_RECIPIENT,

            maximumRaw:
                MAX_PAYMENT_RAW
                    .toString(),

            realExecutionEnabled:
                REAL_PAYMENT_ENABLED,
        },

        security: {
            browserWalletAuthorization:
                "EIP-712",

            exactRequestBinding:
                true,

            payerKeyServerSide:
                true,

            payerKeyExposedToBrowser:
                false,
        },

        rpc,
    };
}

/*
 * =======================================================
 * PUBLIC CONFIG
 * =======================================================
 */

function getPublicConfig() {
    return {
        product:
            "BOUND",

        network:
            TRANSACTION_AGENT_NETWORK,

        chainId:
            EXPECTED_CHAIN_ID,

        tool: {
            id:
                TRANSACTION_AGENT_TOOL_ID,

            method:
                TRANSACTION_AGENT_METHOD,

            name:
                "Transaction Analysis",
        },

        payment: {
            protocol:
                "BNB MPP",

            token:
                PAYMENT_TOKEN_DISPLAY_NAME,

            tokenContract:
                EXPECTED_PAYMENT_TOKEN,

            recipient:
                EXPECTED_PAYMENT_RECIPIENT,

            maximum:
                formatUnits(
                    MAX_PAYMENT_RAW,
                    18
                ),

            realExecutionEnabled:
                REAL_PAYMENT_ENABLED,
        },

        proof: {
            guardedPaymentTx:
                FINAL_GUARDED_PAYMENT_TX,

            explorerUrl:
                "https://" +
                "testnet.bscscan.com/tx/" +
                FINAL_GUARDED_PAYMENT_TX,

            note:
                "Historical successful BNB MPP payment reference. Runtime request hashes are returned by /api/execute.",
        },
    };
}

/*
 * =======================================================
 * ROUTER
 * =======================================================
 */

async function handleRequest(
    request:
        IncomingMessage,
    response:
        ServerResponse
) {
    if (
        request.method ===
        "OPTIONS"
    ) {
        setCommonHeaders(
            request,
            response
        );

        response.statusCode =
            204;

        response.end();

        return;
    }

    const url =
        getRequestUrl(
            request
        );

    if (
        request.method ===
        "GET" &&
        url.pathname ===
        "/health"
    ) {
        sendJson(
            request,
            response,
            200,
            await getHealth()
        );

        return;
    }

    if (
        request.method ===
        "GET" &&
        url.pathname ===
        "/api/config"
    ) {
        sendJson(
            request,
            response,
            200,
            getPublicConfig()
        );

        return;
    }

    if (
        request.method ===
        "POST" &&
        url.pathname ===
        "/api/inspect"
    ) {
        const parsed =
            transactionInspectRequestSchema
                .parse(
                    await readJsonBody(
                        request
                    )
                );

        let normalizedInput:
            ReturnType<
                typeof normalizeUniversalTransactionInput
            >;

        try {
            normalizedInput =
                normalizeUniversalTransactionInput(
                    parsed.input
                );
        } catch (
            error
        ) {
            sendJson(
                request,
                response,
                400,
                {
                    error:
                        "INVALID_TRANSACTION_INPUT",

                    message:
                        error instanceof Error
                            ? error.message
                            : "Invalid transaction input.",
                }
            );

            return;
        }

        try {
            const facts =
                await fetchUniversalTransactionFacts(
                    parsed.input
                );

            const contract =
                facts.transaction.to
                    ? await resolveContractIntelligence({
                        chainId:
                            facts.subject.chainId,

                        address:
                            facts.transaction.to,

                        calldata:
                            facts.transaction.input,
                    })
                    : null;

            /*
             * interpretTransaction performs the deterministic
             * evidence upgrade internally:
             *
             * raw contract evidence
             * -> protocol identity
             * -> official protocol ABI refinement
             * -> swap intelligence
             * -> human-readable interpretation
             */
            const interpretation =
                interpretTransaction(
                    facts,
                    contract
                );

            sendJson(
                request,
                response,
                200,
                {
                    version:
                        "bound.transaction-inspection.v2",

                    input:
                        normalizedInput,

                    facts,

                    interpretation,

                    trust: {
                        blockchainFacts:
                            "deterministic",

                        networkResolution:
                            facts.evidence
                                .networkResolution,

                        verifiedAbiUsed:
                            interpretation
                                .evidence
                                .verifiedAbiUsed,

                        officialProtocolAbiUsed:
                            interpretation
                                .evidence
                                .officialProtocolAbiUsed,

                        aiUsedForFacts:
                            false,

                        aiUsedForExplanation:
                            false,

                        aiUsedForSecurityDecision:
                            false,
                    },
                }
            );

            return;
        } catch (
            error
        ) {
            const message =
                error instanceof Error
                    ? error.message
                    : "Transaction inspection failed.";

            let statusCode =
                502;

            let errorCode =
                "TRANSACTION_LOOKUP_FAILED";

            if (
                message.includes(
                    "found on multiple supported networks"
                )
            ) {
                statusCode =
                    409;

                errorCode =
                    "AMBIGUOUS_TRANSACTION_NETWORK";
            } else if (
                message.includes(
                    "could not determine the transaction network"
                )
            ) {
                statusCode =
                    503;

                errorCode =
                    "NETWORK_DISCOVERY_INCONCLUSIVE";
            } else if (
                message.includes(
                    "Transaction not found on the networks currently supported by BOUND."
                )
            ) {
                statusCode =
                    404;

                errorCode =
                    "TRANSACTION_NOT_FOUND";
            }

            sendJson(
                request,
                response,
                statusCode,
                {
                    error:
                        errorCode,

                    message,
                }
            );

            return;
        }
    }

    if (
        request.method ===
            "POST" &&
        url.pathname ===
            "/api/agent"
    ) {
        const parsed =
            lensAgentRequestSchema
                .parse(
                    await readJsonBody(
                        request
                    )
                );

        let normalizedInput:
            ReturnType<
                typeof normalizeUniversalTransactionInput
            >;

        try {
            normalizedInput =
                normalizeUniversalTransactionInput(
                    parsed.input
                );
        } catch (
            error
        ) {
            sendJson(
                request,
                response,
                400,
                {
                    error:
                        "INVALID_TRANSACTION_INPUT",

                    message:
                        error instanceof Error
                            ? error.message
                            : "Invalid transaction input.",
                }
            );

            return;
        }

        let facts:
            Awaited<
                ReturnType<
                    typeof fetchUniversalTransactionFacts
                >
            >;

        let interpretation:
            ReturnType<
                typeof interpretTransaction
            >;

        let initialAgentObservations:
            ReturnType<
                typeof deriveInitialAgentObservations
            >;

        try {
            facts =
                await fetchUniversalTransactionFacts(
                    parsed.input
                );

            const contract =
                facts.transaction.to
                    ? await resolveContractIntelligence({
                        chainId:
                            facts.subject.chainId,

                        address:
                            facts.transaction.to,

                        calldata:
                            facts.transaction.input,
                    })
                    : null;

            interpretation =
                interpretTransaction(
                    facts,
                    contract
                );

            initialAgentObservations =
                deriveInitialAgentObservations({
                    contractLookupAttempted:
                        facts.transaction.to !==
                        null,

                    contract,

                    protocol:
                        interpretation.protocol,
                });
        } catch (
            error
        ) {
            const message =
                error instanceof Error
                    ? error.message
                    : "Transaction inspection failed.";

            let statusCode =
                502;

            let errorCode =
                "TRANSACTION_LOOKUP_FAILED";

            if (
                message.includes(
                    "found on multiple supported networks"
                )
            ) {
                statusCode =
                    409;

                errorCode =
                    "AMBIGUOUS_TRANSACTION_NETWORK";
            } else if (
                message.includes(
                    "could not determine the transaction network"
                )
            ) {
                statusCode =
                    503;

                errorCode =
                    "NETWORK_DISCOVERY_INCONCLUSIVE";
            } else if (
                message.includes(
                    "Transaction not found on the networks currently supported by BOUND."
                )
            ) {
                statusCode =
                    404;

                errorCode =
                    "TRANSACTION_NOT_FOUND";
            }

            sendJson(
                request,
                response,
                statusCode,
                {
                    error:
                        errorCode,

                    message,
                }
            );

            return;
        }

        try {
            const runtime =
                await runAgentRuntime({
                    goal:
                        parsed.question,

                    facts,

                    interpretation,

                    observations:
                        initialAgentObservations,
                });

            /*
             * Keep the existing `agent` response shape so the
             * current BOUND AGENT UI remains backward-compatible.
             */
            const agent =
                runtime.lensAgent;

            /*
             * Crossing into Guard does not authorize, sign,
             * execute, or pay anything. It only freezes the
             * exact host-built request for human review.
             */
            const guardPlan =
                runtime.status ===
                    "PAUSED_FOR_AUTHORIZATION" &&
                runtime.paidRequest !==
                    null
                    ? registerRuntimeGuardPlan({
                        task:
                            parsed.question,

                        request:
                            runtime.paidRequest,

                        model:
                            runtime.planner
                                ?.model ??
                            runtime.version,

                        summary:
                            runtime.planner
                                ?.reason ??
                            "The Agent requires a paid tool.",
                    })
                    : null;

            sendJson(
                request,
                response,
                200,
                {
                    version:
                        "bound.lens-agent-response.v1",

                    input:
                        normalizedInput,

                    subject: {
                        transactionHash:
                            facts.subject
                                .transactionHash,

                        network:
                            facts.subject
                                .network,

                        chainId:
                            facts.subject
                                .chainId,
                    },

                    agent,

                    guardPlan,

                    runtime: {
                        version:
                            runtime.version,

                        status:
                            runtime.status,

                        steps:
                            runtime.steps,

                        maxSteps:
                            runtime.maxSteps,

                        autoPayment:
                            runtime.autoPayment,

                        planner:
                            runtime.planner
                                ? {
                                    decision:
                                        runtime.planner
                                            .decision,

                                    requiredCapability:
                                        runtime.planner
                                            .requiredCapability,

                                    selectedTool:
                                        runtime.planner
                                            .selectedTool
                                            ?.id ??
                                        null,

                                    requiresAuthorization:
                                        runtime.planner
                                            .requiresAuthorization,
                                }
                                : null,

                        observations:
                            runtime.observations,

                        activity:
                            runtime.activity,

                        paidRequest:
                            runtime.paidRequest,
                    },

                    trust: {
                        blockchainFacts:
                            "deterministic",

                        aiUsedForAnswer:
                            true,

                        aiUsedForFacts:
                            false,

                        aiUsedForSecurityDecision:
                            false,
                    },
                }
            );

            return;
        } catch (
            error
        ) {
            const message =
                error instanceof Error
                    ? error.message
                    : "Lens Agent failed.";

            sendJson(
                request,
                response,
                502,
                {
                    error:
                        "LENS_AGENT_FAILED",

                    message,
                }
            );

            return;
        }
    }


    if (
        request.method ===
        "POST" &&
        url.pathname ===
        "/api/translate"
    ) {
        const parsed =
            lensTranslationRequestSchema
                .parse(
                    await readJsonBody(
                        request
                    )
                );

        const result =
            await translateLensText({
                text:
                    parsed.text,

                targetLanguage:
                    parsed.targetLanguage,

                protectedTerms:
                    parsed.protectedTerms,
            });

        sendJson(
            request,
            response,
            200,
            result
        );

        return;
    }

    if (
        request.method ===
        "POST" &&
        url.pathname ===
        "/api/plan"
    ) {
        const parsed =
            planRequestSchema.parse(
                await readJsonBody(
                    request
                )
            );

        const result =
            await createPlan(
                parsed.task
            );

        sendJson(
            request,
            response,
            200,
            result
        );

        return;
    }

    if (
        request.method ===
        "POST" &&
        url.pathname ===
        "/api/authorization/prepare"
    ) {
        const parsed =
            prepareAuthorizationRequestSchema
                .parse(
                    await readJsonBody(
                        request
                    )
                );

        const result =
            await prepareAuthorization(
                parsed.planId,
                parsed.walletAddress
            );

        sendJson(
            request,
            response,
            200,
            result
        );

        return;
    }

    if (
        request.method ===
        "POST" &&
        url.pathname ===
        "/api/authorization/confirm"
    ) {
        const parsed =
            confirmAuthorizationRequestSchema
                .parse(
                    await readJsonBody(
                        request
                    )
                );

        const result =
            await confirmAuthorization(
                parsed.authorizationId,
                parsed.signature
            );

        sendJson(
            request,
            response,
            200,
            result
        );

        return;
    }

    if (
        request.method ===
        "POST" &&
        url.pathname ===
        "/api/execute"
    ) {
        const parsed =
            executeRequestSchema
                .parse(
                    await readJsonBody(
                        request
                    )
                );

        const confirmed =
            getConfirmedAuthorization(
                parsed.authorizationId
            );

        const result =
            await executeAuthorization(
                confirmed,
                parsed.scenario,
                parsed.confirmRealPayment
            );

        sendJson(
            request,
            response,
            200,
            result
        );

        return;
    }

    throw new HttpError(
        404,
        "NOT_FOUND",
        "The requested BOUND API route does not exist."
    );
}

/*
 * =======================================================
 * SERVER
 * =======================================================
 */

const server =
    createServer(
        (
            request,
            response
        ) => {
            void handleRequest(
                request,
                response
            )
                .catch(
                    (
                        error
                    ) => {
                        if (
                            error instanceof
                            HttpError
                        ) {
                            sendJson(
                                request,
                                response,
                                error.statusCode,
                                {
                                    error:
                                        error.code,

                                    message:
                                        error.message,

                                    ...(error.details !==
                                        undefined
                                        ? {
                                            details:
                                                error.details,
                                        }
                                        : {}),
                                }
                            );

                            return;
                        }

                        if (
                            error instanceof
                            z.ZodError
                        ) {
                            sendJson(
                                request,
                                response,
                                400,
                                {
                                    error:
                                        "INVALID_REQUEST",

                                    message:
                                        "The request body failed validation.",

                                    issues:
                                        error.issues,
                                }
                            );

                            return;
                        }

                        sendJson(
                            request,
                            response,
                            500,
                            {
                                error:
                                    "INTERNAL_ERROR",

                                message:
                                    error instanceof
                                        Error
                                        ? error.message
                                        : String(
                                            error
                                        ),
                            }
                        );
                    }
                );
        }
    );

server.listen(
    PORT,
    HOST,
    () => {
        console.log(
            ""
        );

        console.log(
            "BOUND PRODUCT API"
        );

        console.log(
            `Listening: http://${HOST}:${PORT}`
        );

        console.log(
            `Network: ${TRANSACTION_AGENT_NETWORK} (${EXPECTED_CHAIN_ID})`
        );

        console.log(
            `Gemini model: ${getTransactionAgentModel()}`
        );

        console.log(
            `Paid tool: ${TOOL_URL}`
        );

        console.log(
            `Payment: 0.001 ${PAYMENT_TOKEN_DISPLAY_NAME} via BNB MPP`
        );

        console.log(
            `Real payment enabled: ${REAL_PAYMENT_ENABLED}`
        );

        console.log(
            "Payer private key exposed: false"
        );

        console.log(
            ""
        );
    }
);