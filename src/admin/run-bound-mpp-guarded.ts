import {
    randomUUID,
} from "node:crypto";

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

import {
    getToolRequestHash,
    type ToolRequest,
} from "../core/request-bound.js";

import {
    signMppRequestAuthorization,
    verifyMppRequestBoundPayment,
    type MppPaymentChallenge,
    type MppRequestAuthorization,
} from "../core/mpp-request-bound.js";

/*
 * =======================================================
 * BOUND — GUARDED REAL MPP PAYMENT
 * =======================================================
 *
 * This is the integration proof that connects:
 *
 *   exact tool request
 *        +
 *   real user EIP-712 authorization
 *        +
 *   real BNB MPP HTTP 402 challenge
 *        +
 *   BOUND request-bound verification
 *        +
 *   real BSC Testnet payment
 *        +
 *   real MPP Payment-Receipt
 *        +
 *   real paid RPC execution
 *
 * The critical security property:
 *
 * If the actual tool request changes after user
 * authorization, BOUND returns BLOCK BEFORE:
 *
 * - payment simulation
 * - payer signing
 * - ERC-20 transfer
 * - createHashCredential()
 * - payment broadcast
 *
 * Even when:
 *
 * - chain is unchanged
 * - token is unchanged
 * - recipient is unchanged
 * - amount is unchanged
 *
 * =======================================================
 * MODES
 * =======================================================
 *
 * Tampered security demonstration:
 *
 *   npm run bound-mpp-guard -- --tamper
 *
 * This MUST NOT broadcast payment.
 *
 * Normal preview:
 *
 *   npm run bound-mpp-guard
 *
 * This verifies everything but does not broadcast.
 *
 * Intentional real payment:
 *
 *   BOUND_EXECUTE_PAYMENT=YES npm run bound-mpp-guard
 *
 * This may broadcast one real BSC Testnet TEST_USDT
 * payment only after BOUND returns ALLOW.
 */

/*
 * =======================================================
 * CONFIGURATION
 * =======================================================
 */

const RPC_URL =
    process.env.BOUND_BSC_TESTNET_RPC ??
    "https://bsc-testnet-dataseed.bnbchain.org";

const TOOL_BASE_URL =
    process.env.BOUND_MPP_TOOL_URL ??
    "http://127.0.0.1:8788";

const USER_PRIVATE_KEY_PATH =
    process.env.BOUND_USER_PRIVATE_KEY_PATH ??
    ".bound/user/private-key";

const TRUSTED_USER_ADDRESS_PATH =
    process.env.BOUND_TRUSTED_USER_ADDRESS_PATH ??
    ".bound/user/address";

const PAYER_PRIVATE_KEY_PATH =
    process.env.BOUND_AGENT_PRIVATE_KEY_PATH ??
    ".bound/agent/private-key";

const CHAIN_ID =
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

const MAX_PAYMENT_RAW =
    1_000_000_000_000_000n;

const TOOL_ID =
    "bound-transaction-check";

const TOOL_METHOD =
    "simulate_transaction";

/*
 * Transaction-check request authorized by the user.
 */
const AUTHORIZED_FROM =
    getAddress(
        "0x471F83E136A45a3E46Caa1A258B88e447d5D5F76"
    );

const AUTHORIZED_TO =
    getAddress(
        "0x32438de3179df205c63e8793A20BA6885762f537"
    );

/*
 * Controlled context mutation used only for the attack
 * demonstration.
 */
const TAMPERED_TO =
    getAddress(
        "0x2222222222222222222222222222222222222222"
    );

const TAMPERED =
    process.argv.includes(
        "--tamper"
    ) ||
    process.env.BOUND_SCENARIO ===
    "tampered";

const EXECUTE_PAYMENT =
    process.env.BOUND_EXECUTE_PAYMENT ===
    "YES";

const AUTHORIZATION_LIFETIME_MS =
    5 *
    60 *
    1000;

const erc20Abi =
    parseAbi([
        "function transfer(address to, uint256 amount) returns (bool)",
        "function balanceOf(address account) view returns (uint256)",
        "function decimals() view returns (uint8)",
        "function symbol() view returns (string)",
    ]);

/*
 * =======================================================
 * TYPES
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
 * LOCAL KEY HELPERS
 * =======================================================
 */

function parsePrivateKey(
    value:
        string,
    source:
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
            `Invalid private key format in ${source}.`
        );
    }

    return trimmed as Hex;
}

async function loadPrivateKey(
    path:
        string
): Promise<Hex> {
    const value =
        await readFile(
            path,
            "utf8"
        );

    return parsePrivateKey(
        value,
        path
    );
}

async function loadTrustedUserAddress() {
    const value =
        (
            await readFile(
                TRUSTED_USER_ADDRESS_PATH,
                "utf8"
            )
        ).trim();

    if (
        !isAddress(
            value
        )
    ) {
        throw new Error(
            `${TRUSTED_USER_ADDRESS_PATH} does not contain a valid EVM address.`
        );
    }

    return getAddress(
        value
    );
}

/*
 * =======================================================
 * TOOL REQUEST
 * =======================================================
 */

function makeToolRequest(
    target:
        string
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
                AUTHORIZED_FROM,

            to:
                target,

            valueWei:
                "0",

            data:
                "0x",
        },
    };
}

function buildProtectedUrl(
    request:
        ToolRequest
): string {
    const args =
        request.arguments;

    if (
        typeof args !==
        "object" ||
        args ===
        null ||
        Array.isArray(
            args
        )
    ) {
        throw new Error(
            "Transaction-check arguments must be an object."
        );
    }

    const record =
        args as Record<
            string,
            unknown
        >;

    const from =
        record.from;

    const to =
        record.to;

    const valueWei =
        record.valueWei;

    const data =
        record.data;

    if (
        typeof from !==
        "string" ||
        !isAddress(
            from
        )
    ) {
        throw new Error(
            "Tool request contains invalid from address."
        );
    }

    if (
        typeof to !==
        "string" ||
        !isAddress(
            to
        )
    ) {
        throw new Error(
            "Tool request contains invalid to address."
        );
    }

    if (
        typeof valueWei !==
        "string" ||
        !/^(0|[1-9]\d*)$/.test(
            valueWei
        )
    ) {
        throw new Error(
            "Tool request contains invalid valueWei."
        );
    }

    if (
        typeof data !==
        "string" ||
        !/^0x(?:[0-9a-fA-F]{2})*$/.test(
            data
        )
    ) {
        throw new Error(
            "Tool request contains invalid calldata."
        );
    }

    const url =
        new URL(
            "/api/transaction-check",
            TOOL_BASE_URL
        );

    url.searchParams.set(
        "from",
        getAddress(
            from
        )
    );

    url.searchParams.set(
        "to",
        getAddress(
            to
        )
    );

    url.searchParams.set(
        "valueWei",
        valueWei
    );

    url.searchParams.set(
        "data",
        data
    );

    return url.toString();
}

/*
 * =======================================================
 * MPP CHALLENGE PARSING
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
        "string" ||
        !/^(0|[1-9]\d*)$/.test(
            request.amount
        )
    ) {
        throw new Error(
            "MPP challenge amount is invalid."
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
            "MPP challenge currency is invalid."
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
            "MPP challenge recipient is invalid."
        );
    }

    if (
        typeof request.methodDetails !==
        "object" ||
        request.methodDetails ===
        null
    ) {
        throw new Error(
            "MPP challenge methodDetails are missing."
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
            "MPP challenge chainId is invalid."
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

function toBoundChallenge(
    request:
        MppChargeRequest
): MppPaymentChallenge {
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

async function fetchChallengeFor(
    request:
        ToolRequest
) {
    const url =
        buildProtectedUrl(
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
            await response.text();

        throw new Error(
            `Expected HTTP 402 from ${url}, received ${response.status}. Body: ${body}`
        );
    }

    const authenticate =
        response.headers.get(
            "www-authenticate"
        );

    if (
        !authenticate
    ) {
        throw new Error(
            "MPP response is missing WWW-Authenticate."
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
        throw new Error(
            `Unexpected MPP method ${challenge.method}.`
        );
    }

    if (
        challenge.intent !==
        "charge"
    ) {
        throw new Error(
            `Unexpected MPP intent ${challenge.intent}.`
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
            "MPP challenge is already expired."
        );
    }

    const payment =
        parseChallengeRequest(
            challenge.request
        );

    return {
        url,
        challenge,
        payment,
        boundChallenge:
            toBoundChallenge(
                payment
            ),
    };
}

/*
 * =======================================================
 * KNOWN PAYMENT POLICY
 * =======================================================
 *
 * This is separate from the user's EIP-712 signature.
 *
 * It prevents this integration client from asking the
 * user to authorize an unexpected chain/token/merchant.
 */

function verifyKnownMerchantPolicy(
    challenge:
        MppPaymentChallenge
) {
    if (
        challenge.chainId !==
        CHAIN_ID
    ) {
        throw new Error(
            `Unexpected MPP chain ${challenge.chainId}.`
        );
    }

    if (
        challenge.currency
            .toLowerCase() !==
        EXPECTED_TOKEN
            .toLowerCase()
    ) {
        throw new Error(
            `Unexpected MPP payment token ${challenge.currency}.`
        );
    }

    if (
        challenge.recipient
            .toLowerCase() !==
        EXPECTED_RECIPIENT
            .toLowerCase()
    ) {
        throw new Error(
            `Unexpected MPP recipient ${challenge.recipient}.`
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
        throw new Error(
            "MPP payment amount must be positive."
        );
    }

    if (
        amount >
        MAX_PAYMENT_RAW
    ) {
        throw new Error(
            `MPP payment amount ${amount} exceeds integration cap ${MAX_PAYMENT_RAW}.`
        );
    }

    if (
        !challenge
            .credentialTypes
            .includes(
                "hash"
            )
    ) {
        throw new Error(
            "MPP challenge does not support hash credentials."
        );
    }
}

/*
 * =======================================================
 * PAYMENT TERMS COMPARISON
 * =======================================================
 */

function comparePaymentTerms(
    first:
        MppPaymentChallenge,
    second:
        MppPaymentChallenge
) {
    return {
        sameChain:
            first.chainId ===
            second.chainId,

        sameToken:
            first.currency
                .toLowerCase() ===
            second.currency
                .toLowerCase(),

        sameRecipient:
            first.recipient
                .toLowerCase() ===
            second.recipient
                .toLowerCase(),

        sameAmount:
            first.amount ===
            second.amount,

        sameHashCredential:
            first
                .credentialTypes
                .includes(
                    "hash"
                ) &&
            second
                .credentialTypes
                .includes(
                    "hash"
                ),
    };
}

/*
 * =======================================================
 * LIVE CHAIN CLIENTS + WALLETS
 * =======================================================
 */

const [
    userPrivateKey,
    payerPrivateKey,
    trustedUserAddress,
] =
    await Promise.all([
        loadPrivateKey(
            USER_PRIVATE_KEY_PATH
        ),

        loadPrivateKey(
            PAYER_PRIVATE_KEY_PATH
        ),

        loadTrustedUserAddress(),
    ]);

const payerAccount =
    privateKeyToAccount(
        payerPrivateKey
    );

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
        account:
            payerAccount,

        chain:
            bscTestnet,

        transport:
            http(
                RPC_URL
            ),
    });

const rpcChainId =
    await publicClient
        .getChainId();

if (
    rpcChainId !==
    CHAIN_ID
) {
    throw new Error(
        `RPC returned chainId=${rpcChainId}; expected ${CHAIN_ID}.`
    );
}

/*
 * =======================================================
 * STEP 1 — AUTHORIZED REQUEST
 * =======================================================
 */

const authorizedRequest =
    makeToolRequest(
        AUTHORIZED_TO
    );

const authorizedRequestHash =
    getToolRequestHash(
        authorizedRequest
    );

console.log(
    ""
);

console.log(
    "BOUND GUARDED MPP FLOW"
);

console.log(
    ""
);

console.log(
    `Scenario: ${TAMPERED
        ? "TAMPERED"
        : "NORMAL"
    }`
);

console.log(
    `Execute payment: ${EXECUTE_PAYMENT}`
);

console.log(
    ""
);

console.log(
    "STEP 1 — EXACT REQUEST"
);

console.log(
    `Tool: ${authorizedRequest.toolId}`
);

console.log(
    `Method: ${authorizedRequest.method}`
);

console.log(
    `Authorized request hash: ${authorizedRequestHash}`
);

/*
 * =======================================================
 * STEP 2 — REAL BASELINE MPP CHALLENGE
 * =======================================================
 *
 * No payment happens here.
 */

console.log(
    ""
);

console.log(
    "STEP 2 — FETCH REAL MPP QUOTE"
);

const baseline =
    await fetchChallengeFor(
        authorizedRequest
    );

verifyKnownMerchantPolicy(
    baseline.boundChallenge
);

console.log(
    "HTTP status: 402"
);

console.log(
    `Chain: ${baseline.boundChallenge.chainId}`
);

console.log(
    `Token: ${baseline.boundChallenge.currency}`
);

console.log(
    `Recipient: ${baseline.boundChallenge.recipient}`
);

console.log(
    `Amount raw: ${baseline.boundChallenge.amount}`
);

console.log(
    "Known merchant policy: PASS"
);

/*
 * =======================================================
 * STEP 3 — REAL USER EIP-712 AUTHORIZATION
 * =======================================================
 *
 * The signed authorization binds:
 *
 * - request hash
 * - tool
 * - method
 * - chain
 * - payment token
 * - payment recipient
 * - maximum amount
 * - hash credential type
 * - expiry
 */

const authorization:
    MppRequestAuthorization = {
    authorizationId:
        randomUUID(),

    requestHash:
        authorizedRequestHash,

    toolId:
        authorizedRequest.toolId,

    method:
        authorizedRequest.method,

    chainId:
        baseline
            .boundChallenge
            .chainId,

    paymentToken:
        baseline
            .boundChallenge
            .currency,

    paymentRecipient:
        baseline
            .boundChallenge
            .recipient,

    /*
     * For this proof we authorize exactly the quoted
     * amount rather than a wider cap.
     */
    maxAmountRaw:
        baseline
            .boundChallenge
            .amount,

    credentialType:
        "hash",

    validUntil:
        Date.now() +
        AUTHORIZATION_LIFETIME_MS,
};

const signedAuthorization =
    await signMppRequestAuthorization({
        authorization,

        privateKey:
            userPrivateKey,
    });

if (
    signedAuthorization.signer
        .toLowerCase() !==
    trustedUserAddress
        .toLowerCase()
) {
    throw new Error(
        [
            "Local user authorization signer does not match",
            `the independently pinned trusted user address ${trustedUserAddress}.`,
        ].join(
            " "
        )
    );
}

console.log(
    ""
);

console.log(
    "STEP 3 — USER AUTHORIZATION"
);

console.log(
    `Authorization signer: ${signedAuthorization.signer}`
);

console.log(
    `Trusted signer: ${trustedUserAddress}`
);

console.log(
    `Authorization ID: ${authorization.authorizationId}`
);

console.log(
    `Authorized request hash: ${authorization.requestHash}`
);

console.log(
    `Valid until: ${new Date(
        authorization.validUntil
    ).toISOString()}`
);

console.log(
    "EIP-712 authorization signed: true"
);

console.log(
    "Private key printed: false"
);

/*
 * =======================================================
 * STEP 4 — ACTUAL REQUEST REACHING PAYMENT BOUNDARY
 * =======================================================
 */

const actualRequest =
    TAMPERED
        ? makeToolRequest(
            TAMPERED_TO
        )
        : authorizedRequest;

const actualRequestHash =
    getToolRequestHash(
        actualRequest
    );

console.log(
    ""
);

console.log(
    "STEP 4 — ACTUAL AGENT REQUEST"
);

console.log(
    `Actual request hash: ${actualRequestHash}`
);

console.log(
    `Request changed: ${authorizedRequestHash !==
    actualRequestHash
    }`
);

if (
    TAMPERED
) {
    console.log(
        `Authorized target: ${AUTHORIZED_TO}`
    );

    console.log(
        `Actual target: ${TAMPERED_TO}`
    );
}

/*
 * For the tampered experiment we ask the same real paid
 * service for a challenge for the mutated request.
 *
 * No payment occurs.
 *
 * This lets us prove whether ordinary payment fields
 * changed or remained identical.
 */
const actualChallengeBundle =
    TAMPERED
        ? await fetchChallengeFor(
            actualRequest
        )
        : baseline;

verifyKnownMerchantPolicy(
    actualChallengeBundle
        .boundChallenge
);

const paymentTermsComparison =
    comparePaymentTerms(
        baseline.boundChallenge,
        actualChallengeBundle
            .boundChallenge
    );

console.log(
    ""
);

console.log(
    "MPP PAYMENT TERMS COMPARISON"
);

console.log(
    `Same chain: ${paymentTermsComparison.sameChain}`
);

console.log(
    `Same token: ${paymentTermsComparison.sameToken}`
);

console.log(
    `Same recipient: ${paymentTermsComparison.sameRecipient}`
);

console.log(
    `Same amount: ${paymentTermsComparison.sameAmount}`
);

console.log(
    `Same hash credential support: ${paymentTermsComparison.sameHashCredential}`
);

/*
 * =======================================================
 * STEP 5 — BOUND SECURITY GATE
 * =======================================================
 *
 * This is before wallet payment simulation/signing.
 */

const payerTokenBeforeGate =
    await publicClient
        .readContract({
            address:
                EXPECTED_TOKEN,

            abi:
                erc20Abi,

            functionName:
                "balanceOf",

            args: [
                payerAccount.address,
            ],
        });

const merchantTokenBeforeGate =
    await publicClient
        .readContract({
            address:
                EXPECTED_TOKEN,

            abi:
                erc20Abi,

            functionName:
                "balanceOf",

            args: [
                EXPECTED_RECIPIENT,
            ],
        });

const boundDecision =
    await verifyMppRequestBoundPayment({
        signedAuthorization,

        expectedAuthorizationSigner:
            trustedUserAddress,

        actualRequest,

        challenge:
            actualChallengeBundle
                .boundChallenge,

        now:
            Date.now(),
    });

console.log(
    ""
);

console.log(
    "STEP 5 — BOUND PAYMENT GATE"
);

console.log(
    `Decision: ${boundDecision.decision}`
);

console.log(
    `Finding: ${boundDecision.findings[0]?.code}`
);

console.log(
    `Message: ${boundDecision.findings[0]?.message}`
);

console.log(
    ""
);

console.log(
    "REQUEST COMPARISON"
);

console.log(
    JSON.stringify(
        boundDecision.requestComparison,
        null,
        2
    )
);

console.log(
    ""
);

console.log(
    "PAYMENT COMPARISON"
);

console.log(
    JSON.stringify(
        boundDecision.paymentComparison,
        null,
        2
    )
);

/*
 * =======================================================
 * BLOCK PATH
 * =======================================================
 *
 * Nothing below this block that can broadcast a payment
 * is reachable when BOUND returns BLOCK.
 */

if (
    boundDecision.decision !==
    "ALLOW"
) {
    const [
        payerTokenAfterGate,
        merchantTokenAfterGate,
    ] =
        await Promise.all([
            publicClient.readContract({
                address:
                    EXPECTED_TOKEN,

                abi:
                    erc20Abi,

                functionName:
                    "balanceOf",

                args: [
                    payerAccount.address,
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
        ]);

    console.log(
        ""
    );

    console.log(
        "BOUND PAYMENT STOPPED"
    );

    console.log(
        "Payment simulation invoked: false"
    );

    console.log(
        "Payer signing invoked: false"
    );

    console.log(
        "Payment broadcast: false"
    );

    console.log(
        "Payment tx hash: none"
    );

    console.log(
        `Payer token delta: ${payerTokenAfterGate -
        payerTokenBeforeGate
        }`
    );

    console.log(
        `Merchant token delta: ${merchantTokenAfterGate -
        merchantTokenBeforeGate
        }`
    );

    console.log(
        ""
    );

    console.log(
        `STATUS: ${boundDecision.findings[0]?.code ===
            "REQUEST_PROVENANCE_BREAK"
            ? "REQUEST_TAMPERING_STOPPED_BEFORE_PAYMENT"
            : "PAYMENT_STOPPED_BY_BOUND"
        }`
    );

    if (
        TAMPERED &&
        boundDecision
            .findings[0]
            ?.code !==
        "REQUEST_PROVENANCE_BREAK"
    ) {
        throw new Error(
            "Tampered scenario was blocked, but not for the expected request provenance reason."
        );
    }

    process.exit(
        0
    );
}

/*
 * A tampered request must never reach ALLOW.
 */
if (
    TAMPERED
) {
    throw new Error(
        "SECURITY FAILURE: tampered request unexpectedly passed the BOUND payment gate."
    );
}

/*
 * =======================================================
 * NORMAL PREVIEW
 * =======================================================
 */

if (
    !EXECUTE_PAYMENT
) {
    console.log(
        ""
    );

    console.log(
        "BOUND PAYMENT READY"
    );

    console.log(
        "Exact request verified: true"
    );

    console.log(
        "MPP challenge verified: true"
    );

    console.log(
        "Payment broadcast: false"
    );

    console.log(
        ""
    );

    console.log(
        "STATUS: BOUND_ALLOW_PREVIEW"
    );

    console.log(
        ""
    );

    console.log(
        "To intentionally execute the real testnet payment:"
    );

    console.log(
        "BOUND_EXECUTE_PAYMENT=YES npm run bound-mpp-guard"
    );

    process.exit(
        0
    );
}

/*
 * =======================================================
 * STEP 6 — REAL PAYMENT SIMULATION
 * =======================================================
 *
 * Reaching here proves BOUND returned ALLOW first.
 */

const payerAccountTokenBalance =
    payerTokenBeforeGate;

const paymentAmount =
    BigInt(
        actualChallengeBundle
            .boundChallenge
            .amount
    );

if (
    payerAccountTokenBalance <
    paymentAmount
) {
    throw new Error(
        "MPP payer does not have enough TEST_USDT."
    );
}

const payerGasBefore =
    await publicClient
        .getBalance({
            address:
                payerAccount.address,
        });

if (
    payerGasBefore <=
    0n
) {
    throw new Error(
        "MPP payer has no tBNB for gas."
    );
}

const tokenDecimals =
    await publicClient
        .readContract({
            address:
                EXPECTED_TOKEN,

            abi:
                erc20Abi,

            functionName:
                "decimals",
        });

const tokenSymbol =
    await publicClient
        .readContract({
            address:
                EXPECTED_TOKEN,

            abi:
                erc20Abi,

            functionName:
                "symbol",
        });

console.log(
    ""
);

console.log(
    "STEP 6 — REAL PAYMENT SIMULATION"
);

const transferSimulation =
    await publicClient
        .simulateContract({
            address:
                actualChallengeBundle
                    .boundChallenge
                    .currency,

            abi:
                erc20Abi,

            functionName:
                "transfer",

            args: [
                actualChallengeBundle
                    .boundChallenge
                    .recipient,

                paymentAmount,
            ],

            account:
                payerAccount,
        });

const estimatedGas =
    await publicClient
        .estimateContractGas({
            address:
                actualChallengeBundle
                    .boundChallenge
                    .currency,

            abi:
                erc20Abi,

            functionName:
                "transfer",

            args: [
                actualChallengeBundle
                    .boundChallenge
                    .recipient,

                paymentAmount,
            ],

            account:
                payerAccount.address,
        });

console.log(
    "Simulation: PASS"
);

console.log(
    `Estimated gas units: ${estimatedGas}`
);

/*
 * =======================================================
 * STEP 7 — REAL BSC TESTNET PAYMENT
 * =======================================================
 */

console.log(
    ""
);

console.log(
    "STEP 7 — BROADCAST GUARDED PAYMENT"
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

const transactionReceipt =
    await publicClient
        .waitForTransactionReceipt({
            hash:
                paymentHash,
        });

if (
    transactionReceipt.status !==
    "success"
) {
    throw new Error(
        `Guarded payment ${paymentHash} reverted.`
    );
}

console.log(
    `Payment confirmed in block: ${transactionReceipt.blockNumber}`
);

/*
 * =======================================================
 * STEP 8 — MPP HASH CREDENTIAL
 * =======================================================
 */

const payerSourceDid =
    `did:pkh:eip155:${CHAIN_ID}:${payerAccount.address}`;

const credential =
    await createHashCredential({
        challenge:
            actualChallengeBundle
                .challenge,

        hash:
            paymentHash,

        source:
            payerSourceDid,
    });

console.log(
    ""
);

console.log(
    "STEP 8 — MPP CREDENTIAL"
);

console.log(
    "Official hash credential created: true"
);

console.log(
    `Credential source: ${payerSourceDid}`
);

/*
 * =======================================================
 * STEP 9 — RETRY EXACT PAID TOOL REQUEST
 * =======================================================
 */

console.log(
    ""
);

console.log(
    "STEP 9 — EXECUTE PAID TOOL"
);

const paidResponse =
    await fetch(
        actualChallengeBundle.url,
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

const receiptHeader =
    paidResponse.headers.get(
        "payment-receipt"
    );

if (
    !receiptHeader
) {
    throw new Error(
        "Paid response is missing Payment-Receipt."
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
    CHAIN_ID
) {
    throw new Error(
        `MPP receipt returned unexpected chainId ${decodedReceipt.chainId}.`
    );
}

if (
    decodedReceipt.reference
        .toLowerCase() !==
    paymentHash
        .toLowerCase()
) {
    throw new Error(
        "MPP Payment-Receipt reference does not match the real payment tx hash."
    );
}

/*
 * =======================================================
 * STEP 10 — VERIFY REAL PAID RESULT
 * =======================================================
 */

const paidBody =
    await paidResponse
        .json() as PaidToolBody;

const expectedActualRequestHash =
    getToolRequestHash(
        actualRequest
    );

if (
    paidBody
        .request
        ?.requestHash !==
    expectedActualRequestHash
) {
    throw new Error(
        "Paid tool requestHash does not match the exact request BOUND authorized."
    );
}

if (
    paidBody
        .result
        ?.source !==
    "live-bsc-testnet-rpc"
) {
    throw new Error(
        "Paid tool result was not produced by the live BSC Testnet RPC path."
    );
}

if (
    paidBody
        .result
        ?.chainId !==
    CHAIN_ID
) {
    throw new Error(
        "Paid tool result returned an unexpected chain."
    );
}

/*
 * =======================================================
 * FINAL ONCHAIN AUDIT
 * =======================================================
 */

const [
    payerTokenAfter,
    merchantTokenAfter,
    payerGasAfter,
] =
    await Promise.all([
        publicClient.readContract({
            address:
                EXPECTED_TOKEN,

            abi:
                erc20Abi,

            functionName:
                "balanceOf",

            args: [
                payerAccount.address,
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

        publicClient.getBalance({
            address:
                payerAccount.address,
        }),
    ]);

console.log(
    ""
);

console.log(
    "STEP 10 — PAID TOOL RESULT"
);

console.log(
    `Tool ID: ${paidBody.request?.toolId}`
);

console.log(
    `Tool method: ${paidBody.request?.method}`
);

console.log(
    `Request hash: ${paidBody.request?.requestHash}`
);

console.log(
    `RPC source: ${paidBody.result?.source}`
);

console.log(
    `RPC block: ${paidBody.result?.blockNumber}`
);

console.log(
    ""
);

console.log(
    JSON.stringify(
        paidBody.result?.rpcResult,
        null,
        2
    )
);

console.log(
    ""
);

console.log(
    "BOUND GUARDED MPP AUDIT"
);

console.log(
    `User authorization signer: ${signedAuthorization.signer}`
);

console.log(
    `Payer wallet: ${payerAccount.address}`
);

console.log(
    `Authorized request hash: ${authorizedRequestHash}`
);

console.log(
    `Executed request hash: ${expectedActualRequestHash}`
);

console.log(
    `Payment token: ${EXPECTED_TOKEN}`
);

console.log(
    `Payment amount: ${formatUnits(
        paymentAmount,
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
        payerTokenBeforeGate -
        payerTokenAfter,
        tokenDecimals
    )} ${tokenSymbol}`
);

console.log(
    `Merchant token increase: ${formatUnits(
        merchantTokenAfter -
        merchantTokenBeforeGate,
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
    "EIP712 USER AUTHORIZATION: true"
);

console.log(
    "EXACT REQUEST BINDING: true"
);

console.log(
    "BOUND GATE BEFORE PAYMENT: true"
);

console.log(
    "REAL HTTP 402: true"
);

console.log(
    "REAL ERC20 PAYMENT: true"
);

console.log(
    "MPP STRICT_FROM: true"
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
    "PRIVATE KEYS PRINTED: false"
);

console.log(
    ""
);

console.log(
    "STATUS: BOUND_GUARDED_MPP_PAYMENT_VERIFIED"
);