import {
    getAddress,
    isAddress,
    recoverTypedDataAddress,
} from "viem";

import {
    privateKeyToAccount,
} from "viem/accounts";

import {
    z,
} from "zod";

import {
    getToolRequestHash,
    parseToolRequest,
    type ToolRequest,
} from "./request-bound.js";

/*
 * =======================================================
 * BOUND — MPP REQUEST-BOUND AUTHORIZATION
 * =======================================================
 *
 * Purpose:
 *
 * Bind a user's cryptographic authorization to:
 *
 * - the exact AI tool request
 * - the exact tool identity
 * - the exact tool method
 * - the payment chain
 * - the payment token
 * - the payment recipient
 * - the maximum payment amount
 * - the allowed MPP credential type
 * - an expiry
 *
 * This verifier runs BEFORE any payment transaction is
 * signed or broadcast.
 *
 * The important invariant is:
 *
 * user-authorized requestHash
 *          ==
 * actual tool requestHash
 *
 * Even if:
 *
 * - merchant is unchanged
 * - token is unchanged
 * - amount is unchanged
 * - chain is unchanged
 *
 * an altered tool argument changes requestHash and BOUND
 * stops the payment before the payer wallet is invoked.
 */

export const MPP_REQUEST_AUTHORIZATION_VERSION =
    "bound.mpp.request.authorization.v1" as const;

const EIP712_DOMAIN_NAME =
    "BOUND";

const EIP712_DOMAIN_VERSION =
    "3";

/*
 * =======================================================
 * COMMON VALIDATION
 * =======================================================
 */

const unsignedIntegerString =
    z.string()
        .regex(
            /^(0|[1-9]\d*)$/
        );

const requestHashSchema =
    z.string()
        .regex(
            /^0x[0-9a-fA-F]{64}$/
        )
        .transform(
            (
                value
            ) =>
                value.toLowerCase() as
                `0x${string}`
        );

const evmAddressSchema =
    z.string()
        .refine(
            (
                value
            ) =>
                isAddress(
                    value
                ),
            "Expected a valid EVM address."
        )
        .transform(
            (
                value
            ) =>
                getAddress(
                    value
                )
        );

const signatureSchema =
    z.string()
        .regex(
            /^0x[0-9a-fA-F]{130}$/
        );

/*
 * =======================================================
 * USER AUTHORIZATION
 * =======================================================
 */

export const mppRequestAuthorizationSchema =
    z.object({
        authorizationId:
            z.string()
                .trim()
                .min(1),

        requestHash:
            requestHashSchema,

        toolId:
            z.string()
                .trim()
                .min(1),

        method:
            z.string()
                .trim()
                .min(1),

        chainId:
            z.number()
                .int()
                .positive(),

        paymentToken:
            evmAddressSchema,

        paymentRecipient:
            evmAddressSchema,

        maxAmountRaw:
            unsignedIntegerString,

        credentialType:
            z.literal(
                "hash"
            ),

        validUntil:
            z.number()
                .int()
                .positive(),
    });

export type MppRequestAuthorization =
    z.infer<
        typeof mppRequestAuthorizationSchema
    >;

/*
 * =======================================================
 * EIP-712
 * =======================================================
 */

export const mppRequestAuthorizationTypes = {
    MppRequestAuthorization: [
        {
            name:
                "authorizationId",

            type:
                "string",
        },

        {
            name:
                "requestHash",

            type:
                "bytes32",
        },

        {
            name:
                "toolId",

            type:
                "string",
        },

        {
            name:
                "method",

            type:
                "string",
        },

        {
            name:
                "chainId",

            type:
                "uint256",
        },

        {
            name:
                "paymentToken",

            type:
                "address",
        },

        {
            name:
                "paymentRecipient",

            type:
                "address",
        },

        {
            name:
                "maxAmountRaw",

            type:
                "uint256",
        },

        {
            name:
                "credentialType",

            type:
                "string",
        },

        {
            name:
                "validUntil",

            type:
                "uint256",
        },
    ],
} as const;

export function buildMppRequestAuthorizationTypedData(
    input:
        MppRequestAuthorization
) {
    const authorization =
        mppRequestAuthorizationSchema.parse(
            input
        );

    return {
        domain: {
            name:
                EIP712_DOMAIN_NAME,

            version:
                EIP712_DOMAIN_VERSION,

            chainId:
                authorization.chainId,
        },

        types:
            mppRequestAuthorizationTypes,

        primaryType:
            "MppRequestAuthorization" as const,

        message: {
            authorizationId:
                authorization.authorizationId,

            requestHash:
                authorization.requestHash,

            toolId:
                authorization.toolId,

            method:
                authorization.method,

            chainId:
                BigInt(
                    authorization.chainId
                ),

            paymentToken:
                authorization.paymentToken,

            paymentRecipient:
                authorization.paymentRecipient,

            maxAmountRaw:
                BigInt(
                    authorization.maxAmountRaw
                ),

            credentialType:
                authorization.credentialType,

            validUntil:
                BigInt(
                    authorization.validUntil
                ),
        },
    };
}

/*
 * =======================================================
 * SIGNED AUTHORIZATION
 * =======================================================
 */

export const signedMppRequestAuthorizationSchema =
    z.object({
        version:
            z.literal(
                MPP_REQUEST_AUTHORIZATION_VERSION
            ),

        signer:
            evmAddressSchema,

        authorization:
            mppRequestAuthorizationSchema,

        signature:
            signatureSchema,
    });

export type SignedMppRequestAuthorization =
    z.infer<
        typeof signedMppRequestAuthorizationSchema
    >;

export async function signMppRequestAuthorization(
    input: {
        authorization:
        MppRequestAuthorization;

        privateKey:
        `0x${string}`;
    }
): Promise<
    SignedMppRequestAuthorization
> {
    const authorization =
        mppRequestAuthorizationSchema.parse(
            input.authorization
        );

    const account =
        privateKeyToAccount(
            input.privateKey
        );

    const typedData =
        buildMppRequestAuthorizationTypedData(
            authorization
        );

    const signature =
        await account.signTypedData({
            domain:
                typedData.domain,

            types:
                typedData.types,

            primaryType:
                typedData.primaryType,

            message:
                typedData.message,
        });

    return signedMppRequestAuthorizationSchema.parse({
        version:
            MPP_REQUEST_AUTHORIZATION_VERSION,

        signer:
            account.address,

        authorization,

        signature,
    });
}

/*
 * =======================================================
 * SIGNATURE VERIFICATION
 * =======================================================
 */

export type MppAuthorizationVerification =
    | {
        valid:
        true;

        signer:
        `0x${string}`;

        authorization:
        MppRequestAuthorization;
    }
    | {
        valid:
        false;

        code:
        | "INVALID_MPP_AUTHORIZATION"
        | "INVALID_EXPECTED_SIGNER"
        | "UNAUTHORIZED_MPP_SIGNER"
        | "INVALID_MPP_AUTHORIZATION_SIGNATURE";

        message:
        string;
    };

export async function verifySignedMppRequestAuthorization(
    input: {
        envelope:
        unknown;

        expectedSigner:
        string;
    }
): Promise<
    MppAuthorizationVerification
> {
    const parsed =
        signedMppRequestAuthorizationSchema
            .safeParse(
                input.envelope
            );

    if (
        !parsed.success
    ) {
        return {
            valid:
                false,

            code:
                "INVALID_MPP_AUTHORIZATION",

            message:
                "The signed MPP request authorization is malformed.",
        };
    }

    let expectedSigner:
        `0x${string}`;

    try {
        expectedSigner =
            getAddress(
                input.expectedSigner
            );
    } catch {
        return {
            valid:
                false,

            code:
                "INVALID_EXPECTED_SIGNER",

            message:
                "The expected authorization signer is not a valid EVM address.",
        };
    }

    const envelope =
        parsed.data;

    if (
        envelope.signer
            .toLowerCase() !==
        expectedSigner
            .toLowerCase()
    ) {
        return {
            valid:
                false,

            code:
                "UNAUTHORIZED_MPP_SIGNER",

            message:
                "The MPP request authorization was not signed by the expected user wallet.",
        };
    }

    try {
        const typedData =
            buildMppRequestAuthorizationTypedData(
                envelope.authorization
            );

        const recovered =
            await recoverTypedDataAddress({
                domain:
                    typedData.domain,

                types:
                    typedData.types,

                primaryType:
                    typedData.primaryType,

                message:
                    typedData.message,

                signature:
                    envelope.signature as
                    `0x${string}`,
            });

        if (
            recovered
                .toLowerCase() !==
            expectedSigner
                .toLowerCase()
        ) {
            return {
                valid:
                    false,

                code:
                    "INVALID_MPP_AUTHORIZATION_SIGNATURE",

                message:
                    "The EIP-712 signature does not match the expected user wallet.",
            };
        }

        return {
            valid:
                true,

            signer:
                expectedSigner,

            authorization:
                envelope.authorization,
        };
    } catch {
        return {
            valid:
                false,

            code:
                "INVALID_MPP_AUTHORIZATION_SIGNATURE",

            message:
                "The MPP request authorization signature could not be verified.",
        };
    }
}

/*
 * =======================================================
 * MPP CHALLENGE
 * =======================================================
 *
 * This is the subset of a real BNB MPP charge challenge
 * that BOUND needs at the payment boundary.
 *
 * It deliberately does not replace or reimplement MPP.
 *
 * MPP remains responsible for:
 *
 * - challenge creation
 * - hash credential verification
 * - strict_from verification
 * - onchain payment verification
 * - replay protection
 * - Payment-Receipt generation
 *
 * BOUND checks whether that payment may happen for the
 * exact AI tool request.
 */

export const mppPaymentChallengeSchema =
    z.object({
        chainId:
            z.number()
                .int()
                .positive(),

        currency:
            evmAddressSchema,

        recipient:
            evmAddressSchema,

        amount:
            unsignedIntegerString,

        credentialTypes:
            z.array(
                z.string()
                    .min(1)
            )
                .min(1),
    });

export type MppPaymentChallenge =
    z.infer<
        typeof mppPaymentChallengeSchema
    >;

/*
 * =======================================================
 * RESULT
 * =======================================================
 */

export type MppRequestBoundFinding = {
    code:
    string;

    message:
    string;
};

export type MppRequestBoundVerification = {
    decision:
    | "ALLOW"
    | "BLOCK"
    | "NEEDS_REAUTHORIZATION";

    findings:
    MppRequestBoundFinding[];

    requestComparison?: {
        authorizedRequestHash:
        string;

        actualRequestHash:
        string;

        matches:
        boolean;
    };

    paymentComparison?: {
        chainMatches:
        boolean;

        tokenMatches:
        boolean;

        recipientMatches:
        boolean;

        amountWithinAuthorization:
        boolean;

        credentialTypeAllowed:
        boolean;
    };
};

/*
 * =======================================================
 * REQUEST-BOUND MPP VERIFICATION
 * =======================================================
 *
 * CRITICAL:
 *
 * Call this function BEFORE:
 *
 * - ERC-20 transfer simulation intended for payment
 * - wallet signing
 * - payment broadcast
 * - createHashCredential(...)
 *
 * ALLOW means only:
 *
 * The exact actual tool request and actual MPP challenge
 * match the user's signed authorization.
 *
 * It does NOT mean:
 *
 * - the tool is honest
 * - the requested transaction is globally safe
 * - the RPC is honest
 * - all prompt injection is prevented
 */

export async function verifyMppRequestBoundPayment(
    input: {
        signedAuthorization:
        unknown;

        expectedAuthorizationSigner:
        string;

        actualRequest:
        unknown;

        challenge:
        unknown;

        now?:
        number;
    }
): Promise<
    MppRequestBoundVerification
> {
    let request:
        ToolRequest;

    try {
        request =
            parseToolRequest(
                input.actualRequest
            );
    } catch {
        return {
            decision:
                "BLOCK",

            findings: [
                {
                    code:
                        "INVALID_TOOL_REQUEST",

                    message:
                        "The actual tool request cannot be represented as a canonical BOUND request.",
                },
            ],
        };
    }

    const challengeResult =
        mppPaymentChallengeSchema
            .safeParse(
                input.challenge
            );

    if (
        !challengeResult.success
    ) {
        return {
            decision:
                "BLOCK",

            findings: [
                {
                    code:
                        "INVALID_MPP_CHALLENGE",

                    message:
                        "The MPP payment challenge is malformed.",
                },
            ],
        };
    }

    const authorizationResult =
        await verifySignedMppRequestAuthorization({
            envelope:
                input.signedAuthorization,

            expectedSigner:
                input.expectedAuthorizationSigner,
        });

    if (
        !authorizationResult.valid
    ) {
        return {
            decision:
                "BLOCK",

            findings: [
                {
                    code:
                        authorizationResult.code,

                    message:
                        authorizationResult.message,
                },
            ],
        };
    }

    const authorization =
        authorizationResult.authorization;

    const challenge =
        challengeResult.data;

    const actualRequestHash =
        getToolRequestHash(
            request
        );

    const now =
        input.now ??
        Date.now();

    const requestComparison = {
        authorizedRequestHash:
            authorization.requestHash,

        actualRequestHash,

        matches:
            authorization.requestHash ===
            actualRequestHash,
    };

    const paymentComparison = {
        chainMatches:
            authorization.chainId ===
            challenge.chainId,

        tokenMatches:
            authorization.paymentToken
                .toLowerCase() ===
            challenge.currency
                .toLowerCase(),

        recipientMatches:
            authorization.paymentRecipient
                .toLowerCase() ===
            challenge.recipient
                .toLowerCase(),

        amountWithinAuthorization:
            BigInt(
                challenge.amount
            ) <=
            BigInt(
                authorization.maxAmountRaw
            ),

        credentialTypeAllowed:
            challenge
                .credentialTypes
                .includes(
                    authorization.credentialType
                ),
    };

    /*
     * ---------------------------------------------------
     * AUTHORIZATION EXPIRY
     * ---------------------------------------------------
     */

    if (
        authorization.validUntil <=
        now
    ) {
        return {
            decision:
                "NEEDS_REAUTHORIZATION",

            findings: [
                {
                    code:
                        "MPP_AUTHORIZATION_EXPIRED",

                    message:
                        "The user's request-bound payment authorization has expired.",
                },
            ],

            requestComparison,

            paymentComparison,
        };
    }

    /*
     * ---------------------------------------------------
     * EXACT REQUEST BINDING
     * ---------------------------------------------------
     */

    if (
        authorization.requestHash !==
        actualRequestHash
    ) {
        return {
            decision:
                "BLOCK",

            findings: [
                {
                    code:
                        "REQUEST_PROVENANCE_BREAK",

                    message:
                        "The actual tool request differs from the exact request authorized by the user.",
                },
            ],

            requestComparison,

            paymentComparison,
        };
    }

    /*
     * Defense in depth:
     *
     * requestHash already binds toolId and method, but these
     * explicit checks produce clearer diagnostics.
     */

    if (
        authorization.toolId !==
        request.toolId ||
        authorization.method !==
        request.method
    ) {
        return {
            decision:
                "BLOCK",

            findings: [
                {
                    code:
                        "TOOL_PROVENANCE_BREAK",

                    message:
                        "The actual tool identity or method differs from the user's signed authorization.",
                },
            ],

            requestComparison,

            paymentComparison,
        };
    }

    /*
     * ---------------------------------------------------
     * PAYMENT CHAIN
     * ---------------------------------------------------
     */

    if (
        authorization.chainId !==
        challenge.chainId
    ) {
        return {
            decision:
                "BLOCK",

            findings: [
                {
                    code:
                        "MPP_CHAIN_MISMATCH",

                    message:
                        "The MPP challenge uses a different chain than the user authorized.",
                },
            ],

            requestComparison,

            paymentComparison,
        };
    }

    /*
     * ---------------------------------------------------
     * PAYMENT TOKEN
     * ---------------------------------------------------
     */

    if (
        authorization.paymentToken
            .toLowerCase() !==
        challenge.currency
            .toLowerCase()
    ) {
        return {
            decision:
                "BLOCK",

            findings: [
                {
                    code:
                        "MPP_TOKEN_MISMATCH",

                    message:
                        "The MPP challenge requests a different payment token than the user authorized.",
                },
            ],

            requestComparison,

            paymentComparison,
        };
    }

    /*
     * ---------------------------------------------------
     * PAYMENT RECIPIENT
     * ---------------------------------------------------
     */

    if (
        authorization.paymentRecipient
            .toLowerCase() !==
        challenge.recipient
            .toLowerCase()
    ) {
        return {
            decision:
                "BLOCK",

            findings: [
                {
                    code:
                        "MPP_RECIPIENT_MISMATCH",

                    message:
                        "The MPP challenge requests payment to a different recipient than the user authorized.",
                },
            ],

            requestComparison,

            paymentComparison,
        };
    }

    /*
     * ---------------------------------------------------
     * CREDENTIAL TYPE
     * ---------------------------------------------------
     */

    if (
        !challenge
            .credentialTypes
            .includes(
                authorization.credentialType
            )
    ) {
        return {
            decision:
                "BLOCK",

            findings: [
                {
                    code:
                        "MPP_CREDENTIAL_TYPE_MISMATCH",

                    message:
                        "The MPP challenge does not support the credential type authorized for this payment.",
                },
            ],

            requestComparison,

            paymentComparison,
        };
    }

    /*
     * ---------------------------------------------------
     * PAYMENT AMOUNT
     * ---------------------------------------------------
     */

    if (
        BigInt(
            challenge.amount
        ) >
        BigInt(
            authorization.maxAmountRaw
        )
    ) {
        return {
            decision:
                "NEEDS_REAUTHORIZATION",

            findings: [
                {
                    code:
                        "MPP_AMOUNT_EXCEEDS_AUTHORIZATION",

                    message:
                        "The MPP challenge exceeds the user's signed maximum payment amount.",
                },
            ],

            requestComparison,

            paymentComparison,
        };
    }

    if (
        BigInt(
            challenge.amount
        ) <=
        0n
    ) {
        return {
            decision:
                "BLOCK",

            findings: [
                {
                    code:
                        "INVALID_MPP_AMOUNT",

                    message:
                        "The MPP challenge requests a non-positive payment amount.",
                },
            ],

            requestComparison,

            paymentComparison,
        };
    }

    /*
     * ---------------------------------------------------
     * VERIFIED
     * ---------------------------------------------------
     */

    return {
        decision:
            "ALLOW",

        findings: [
            {
                code:
                    "MPP_REQUEST_BOUND_VERIFIED",

                message:
                    "The exact tool request and MPP payment challenge match the user's signed authorization.",
            },
        ],

        requestComparison,

        paymentComparison,
    };
}