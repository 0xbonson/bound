import {
    sign as signBytes,
    verify as verifyBytes,
} from "node:crypto";

import {
    getAddress,
    isAddress,
    keccak256,
    recoverTypedDataAddress,
    stringToHex,
} from "viem";

import {
    privateKeyToAccount,
} from "viem/accounts";

import {
    z,
} from "zod";

import {
    type RawNativeTransaction,
    rawNativeTransactionSchema,
} from "./native.js";

/*
 * =======================================================
 * VERSIONING
 * =======================================================
 */

export const REQUEST_HASH_VERSION =
    "bound.tool-request.v1" as const;

export const REQUEST_AUTHORIZATION_VERSION =
    "bound.request.authorization.v1" as const;

export const REQUEST_EVIDENCE_VERSION =
    "bound.request.evidence.v1" as const;

const EIP712_DOMAIN_NAME =
    "BOUND";

const EIP712_DOMAIN_VERSION =
    "2";

/*
 * =======================================================
 * JSON CANONICALIZATION
 * =======================================================
 *
 * BOUND hashes the exact semantic tool request.
 *
 * Object keys are sorted recursively so:
 *
 * { "a": 1, "b": 2 }
 *
 * and
 *
 * { "b": 2, "a": 1 }
 *
 * produce the same canonical request.
 *
 * Arrays preserve order because array order can carry
 * semantic meaning.
 *
 * Unsupported JavaScript values are rejected instead of
 * being silently removed.
 */

export type JsonPrimitive =
    | string
    | number
    | boolean
    | null;

export type JsonValue =
    | JsonPrimitive
    | JsonValue[]
    | {
        [key: string]:
        JsonValue;
    };

export function normalizeJsonValue(
    value:
        unknown
): JsonValue {
    if (
        value ===
        null
    ) {
        return null;
    }

    if (
        typeof value ===
        "string" ||
        typeof value ===
        "boolean"
    ) {
        return value;
    }

    if (
        typeof value ===
        "number"
    ) {
        if (
            !Number.isFinite(
                value
            )
        ) {
            throw new Error(
                "NON_FINITE_JSON_NUMBER"
            );
        }

        if (
            Object.is(
                value,
                -0
            )
        ) {
            return 0;
        }

        return value;
    }

    if (
        Array.isArray(
            value
        )
    ) {
        return value.map(
            normalizeJsonValue
        );
    }

    if (
        typeof value ===
        "object"
    ) {
        const prototype =
            Object.getPrototypeOf(
                value
            );

        if (
            prototype !==
            Object.prototype &&
            prototype !==
            null
        ) {
            throw new Error(
                "NON_PLAIN_JSON_OBJECT"
            );
        }

        const record =
            value as
            Record<
                string,
                unknown
            >;

        const normalized:
            Record<
                string,
                JsonValue
            > = {};

        const keys =
            Object.keys(
                record
            ).sort();

        for (
            const key of keys
        ) {
            const entry =
                record[key];

            if (
                entry ===
                undefined ||
                typeof entry ===
                "function" ||
                typeof entry ===
                "symbol" ||
                typeof entry ===
                "bigint"
            ) {
                throw new Error(
                    `UNSUPPORTED_JSON_VALUE:${key}`
                );
            }

            normalized[key] =
                normalizeJsonValue(
                    entry
                );
        }

        return normalized;
    }

    throw new Error(
        "UNSUPPORTED_JSON_VALUE"
    );
}

export function canonicalizeJson(
    value:
        JsonValue
): string {
    if (
        value ===
        null
    ) {
        return "null";
    }

    if (
        typeof value ===
        "string" ||
        typeof value ===
        "number" ||
        typeof value ===
        "boolean"
    ) {
        return JSON.stringify(
            value
        );
    }

    if (
        Array.isArray(
            value
        )
    ) {
        return `[${value
            .map(
                canonicalizeJson
            )
            .join(",")}]`;
    }

    const keys =
        Object.keys(
            value
        ).sort();

    return `{${keys
        .map(
            (key) =>
                `${JSON.stringify(
                    key
                )}:${canonicalizeJson(
                    value[key]!
                )}`
        )
        .join(",")}}`;
}

/*
 * =======================================================
 * TOOL REQUEST
 * =======================================================
 */

const rawToolRequestSchema =
    z.object({
        toolId:
            z.string()
                .trim()
                .min(1),

        method:
            z.string()
                .trim()
                .min(1),

        arguments:
            z.unknown(),
    });

export type ToolRequest = {
    toolId:
    string;

    method:
    string;

    arguments:
    JsonValue;
};

export function parseToolRequest(
    input:
        unknown
): ToolRequest {
    const parsed =
        rawToolRequestSchema.parse(
            input
        );

    return {
        toolId:
            parsed.toolId,

        method:
            parsed.method,

        arguments:
            normalizeJsonValue(
                parsed.arguments
            ),
    };
}

/*
 * =======================================================
 * REQUEST HASH
 * =======================================================
 *
 * Domain separation prevents the resulting hash from
 * being confused with another BOUND hash type.
 *
 * The hash binds:
 *
 * - protocol version
 * - tool identity
 * - tool method
 * - exact normalized arguments
 */

export function getToolRequestHash(
    input:
        unknown
): `0x${string}` {
    const request =
        parseToolRequest(
            input
        );

    const canonical =
        canonicalizeJson({
            version:
                REQUEST_HASH_VERSION,

            toolId:
                request.toolId,

            method:
                request.method,

            arguments:
                request.arguments,
        });

    return keccak256(
        stringToHex(
            canonical
        )
    );
}

/*
 * =======================================================
 * COMMON SCHEMAS
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
            (value) =>
                value.toLowerCase() as
                `0x${string}`
        );

const evmAddressSchema =
    z.string()
        .refine(
            (value) =>
                isAddress(
                    value
                ),
            "Expected a valid EVM address."
        )
        .transform(
            (value) =>
                getAddress(
                    value
                )
        );

const ecdsaSignatureSchema =
    z.string()
        .regex(
            /^0x[0-9a-fA-F]{130}$/
        );

/*
 * =======================================================
 * REQUEST-BOUND USER AUTHORIZATION
 * =======================================================
 *
 * The user does not merely authorize:
 *
 * "spend <= X"
 *
 * The user authorizes:
 *
 * "spend <= X for THIS exact request hash".
 */

export const requestBoundAuthorizationSchema =
    z.object({
        authorizationId:
            z.string()
                .min(1),

        requestHash:
            requestHashSchema,

        toolId:
            z.string()
                .min(1),

        method:
            z.string()
                .min(1),

        chainId:
            z.number()
                .int()
                .positive(),

        assetType:
            z.literal(
                "native"
            ),

        assetSymbol:
            z.string()
                .min(1),

        maxAmountWei:
            unsignedIntegerString,

        trustedSourceId:
            z.string()
                .min(1),

        validUntil:
            z.number()
                .int()
                .positive(),
    });

export type RequestBoundAuthorization =
    z.infer<
        typeof requestBoundAuthorizationSchema
    >;

/*
 * =======================================================
 * EIP-712 TYPES
 * =======================================================
 */

export const requestBoundAuthorizationTypes = {
    RequestBoundAuthorization: [
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
                "assetType",

            type:
                "string",
        },

        {
            name:
                "assetSymbol",

            type:
                "string",
        },

        {
            name:
                "maxAmountWei",

            type:
                "uint256",
        },

        {
            name:
                "trustedSourceId",

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

export function buildRequestBoundAuthorizationTypedData(
    input:
        RequestBoundAuthorization
) {
    const authorization =
        requestBoundAuthorizationSchema.parse(
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
            requestBoundAuthorizationTypes,

        primaryType:
            "RequestBoundAuthorization" as const,

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

            assetType:
                authorization.assetType,

            assetSymbol:
                authorization.assetSymbol,

            maxAmountWei:
                BigInt(
                    authorization.maxAmountWei
                ),

            trustedSourceId:
                authorization.trustedSourceId,

            validUntil:
                BigInt(
                    authorization.validUntil
                ),
        },
    };
}

/*
 * =======================================================
 * SIGNED AUTHORIZATION ENVELOPE
 * =======================================================
 */

export const signedRequestBoundAuthorizationSchema =
    z.object({
        version:
            z.literal(
                REQUEST_AUTHORIZATION_VERSION
            ),

        signer:
            evmAddressSchema,

        authorization:
            requestBoundAuthorizationSchema,

        signature:
            ecdsaSignatureSchema,
    });

export type SignedRequestBoundAuthorization =
    z.infer<
        typeof signedRequestBoundAuthorizationSchema
    >;

export async function signRequestBoundAuthorization(
    input: {
        authorization:
        RequestBoundAuthorization;

        privateKey:
        `0x${string}`;
    }
): Promise<
    SignedRequestBoundAuthorization
> {
    const authorization =
        requestBoundAuthorizationSchema.parse(
            input.authorization
        );

    const account =
        privateKeyToAccount(
            input.privateKey
        );

    const typedData =
        buildRequestBoundAuthorizationTypedData(
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

    return signedRequestBoundAuthorizationSchema.parse({
        version:
            REQUEST_AUTHORIZATION_VERSION,

        signer:
            account.address,

        authorization,

        signature,
    });
}

/*
 * =======================================================
 * AUTHORIZATION VERIFICATION
 * =======================================================
 */

export type RequestAuthorizationVerification =
    | {
        valid:
        true;

        signer:
        `0x${string}`;

        authorization:
        RequestBoundAuthorization;
    }
    | {
        valid:
        false;

        code:
        | "INVALID_AUTHORIZATION_ENVELOPE"
        | "INVALID_EXPECTED_SIGNER"
        | "UNAUTHORIZED_AUTHORIZATION_SIGNER"
        | "INVALID_AUTHORIZATION_SIGNATURE";

        message:
        string;
    };

export async function verifySignedRequestBoundAuthorization(
    input: {
        envelope:
        unknown;

        expectedSigner:
        string;
    }
): Promise<
    RequestAuthorizationVerification
> {
    const parsed =
        signedRequestBoundAuthorizationSchema
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
                "INVALID_AUTHORIZATION_ENVELOPE",

            message:
                "The request-bound authorization envelope is malformed.",
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
                "The expected user signer address is invalid.",
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
                "UNAUTHORIZED_AUTHORIZATION_SIGNER",

            message:
                "The authorization envelope signer is not the expected user signer.",
        };
    }

    try {
        const typedData =
            buildRequestBoundAuthorizationTypedData(
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
                    "INVALID_AUTHORIZATION_SIGNATURE",

                message:
                    "The request-bound EIP-712 signature was not produced by the expected user signer.",
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
                "INVALID_AUTHORIZATION_SIGNATURE",

            message:
                "The request-bound EIP-712 signature could not be verified.",
        };
    }
}

/*
 * =======================================================
 * PROVIDER PAYMENT EVIDENCE
 * =======================================================
 *
 * The provider signs:
 *
 * exact request hash
 * +
 * exact payment terms.
 *
 * Therefore a payment quote for one tool request cannot be
 * silently reused for a different tool request.
 */

export const requestBoundEvidenceSchema =
    z.object({
        sourceId:
            z.string()
                .min(1),

        requestHash:
            requestHashSchema,

        toolId:
            z.string()
                .min(1),

        method:
            z.string()
                .min(1),

        chainId:
            z.number()
                .int()
                .positive(),

        assetType:
            z.literal(
                "native"
            ),

        assetSymbol:
            z.string()
                .min(1),

        recipient:
            evmAddressSchema,

        amountWei:
            unsignedIntegerString,

        nonce:
            z.string()
                .min(1),

        issuedAt:
            z.number()
                .int()
                .positive(),

        expiresAt:
            z.number()
                .int()
                .positive(),
    });

export type RequestBoundEvidence =
    z.infer<
        typeof requestBoundEvidenceSchema
    >;

export const requestBoundEvidenceEnvelopeSchema =
    z.object({
        version:
            z.literal(
                REQUEST_EVIDENCE_VERSION
            ),

        evidence:
            requestBoundEvidenceSchema,

        signatureBase64:
            z.string()
                .min(1),
    });

export type RequestBoundEvidenceEnvelope =
    z.infer<
        typeof requestBoundEvidenceEnvelopeSchema
    >;

/*
 * =======================================================
 * CANONICAL EVIDENCE
 * =======================================================
 */

function canonicalRequestBoundEvidence(
    input:
        RequestBoundEvidence
): string {
    const evidence =
        requestBoundEvidenceSchema.parse(
            input
        );

    return canonicalizeJson({
        version:
            REQUEST_EVIDENCE_VERSION,

        sourceId:
            evidence.sourceId,

        requestHash:
            evidence.requestHash,

        toolId:
            evidence.toolId,

        method:
            evidence.method,

        chainId:
            evidence.chainId,

        assetType:
            evidence.assetType,

        assetSymbol:
            evidence.assetSymbol,

        recipient:
            evidence.recipient,

        amountWei:
            evidence.amountWei,

        nonce:
            evidence.nonce,

        issuedAt:
            evidence.issuedAt,

        expiresAt:
            evidence.expiresAt,
    });
}

export function getRequestBoundEvidenceId(
    input:
        RequestBoundEvidence
): `0x${string}` {
    return keccak256(
        stringToHex(
            canonicalRequestBoundEvidence(
                input
            )
        )
    );
}

/*
 * =======================================================
 * ED25519 EVIDENCE SIGNING
 * =======================================================
 */

export function signRequestBoundEvidence(
    input: {
        evidence:
        RequestBoundEvidence;

        privateKeyPem:
        string;
    }
): RequestBoundEvidenceEnvelope {
    const evidence =
        requestBoundEvidenceSchema.parse(
            input.evidence
        );

    const canonical =
        canonicalRequestBoundEvidence(
            evidence
        );

    const signature =
        signBytes(
            null,
            Buffer.from(
                canonical,
                "utf8"
            ),
            input.privateKeyPem
        );

    return requestBoundEvidenceEnvelopeSchema.parse({
        version:
            REQUEST_EVIDENCE_VERSION,

        evidence,

        signatureBase64:
            signature.toString(
                "base64"
            ),
    });
}

export function verifyRequestBoundEvidenceSignature(
    input: {
        envelope:
        unknown;

        publicKeyPem:
        string;
    }
): boolean {
    const parsed =
        requestBoundEvidenceEnvelopeSchema
            .safeParse(
                input.envelope
            );

    if (
        !parsed.success
    ) {
        return false;
    }

    const canonical =
        canonicalRequestBoundEvidence(
            parsed.data
                .evidence
        );

    try {
        return verifyBytes(
            null,
            Buffer.from(
                canonical,
                "utf8"
            ),
            input.publicKeyPem,
            Buffer.from(
                parsed.data
                    .signatureBase64,
                "base64"
            )
        );
    } catch {
        return false;
    }
}

/*
 * =======================================================
 * TRUST
 * =======================================================
 *
 * Keys must be pinned outside model control.
 */

export type RequestBoundTrustedSources =
    Readonly<
        Record<
            string,
            string
        >
    >;

/*
 * =======================================================
 * VERIFICATION RESULT
 * =======================================================
 */

export type RequestBoundFinding = {
    code:
    string;

    message:
    string;
};

export type RequestBoundVerification = {
    decision:
    | "ALLOW"
    | "BLOCK"
    | "NEEDS_REAUTHORIZATION";

    findings:
    RequestBoundFinding[];

    requestComparison?: {
        authorizationRequestHash:
        string;

        evidenceRequestHash:
        string;

        actualRequestHash:
        string;

        authorizationMatchesActual:
        boolean;

        evidenceMatchesActual:
        boolean;
    };

    paymentComparison?: {
        recipientMatches:
        boolean;

        amountMatches:
        boolean;

        chainMatches:
        boolean;

        calldataMatches:
        boolean;
    };

    evidenceId?:
    string;
};

/*
 * =======================================================
 * COMPLETE REQUEST + PAYMENT VERIFICATION
 * =======================================================
 *
 * This function does NOT sign anything.
 * This function does NOT broadcast anything.
 *
 * It only decides whether the exact tool request and exact
 * native payment are cryptographically consistent.
 */

export async function verifyRequestBoundPayment(
    input: {
        signedAuthorization:
        unknown;

        expectedAuthorizationSigner:
        string;

        request:
        unknown;

        evidenceEnvelope:
        unknown;

        trustedSources:
        RequestBoundTrustedSources;

        transaction:
        RawNativeTransaction;

        now?:
        number;
    }
): Promise<
    RequestBoundVerification
> {
    let request:
        ToolRequest;

    try {
        request =
            parseToolRequest(
                input.request
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
                        "The tool request could not be represented as canonical JSON.",
                },
            ],
        };
    }

    const actualRequestHash =
        getToolRequestHash(
            request
        );

    const transactionResult =
        rawNativeTransactionSchema
            .safeParse(
                input.transaction
            );

    if (
        !transactionResult.success
    ) {
        return {
            decision:
                "BLOCK",

            findings: [
                {
                    code:
                        "INVALID_TRANSACTION",

                    message:
                        "The candidate native transaction is malformed.",
                },
            ],
        };
    }

    const authorizationVerification =
        await verifySignedRequestBoundAuthorization({
            envelope:
                input.signedAuthorization,

            expectedSigner:
                input.expectedAuthorizationSigner,
        });

    if (
        !authorizationVerification.valid
    ) {
        return {
            decision:
                "BLOCK",

            findings: [
                {
                    code:
                        authorizationVerification.code,

                    message:
                        authorizationVerification.message,
                },
            ],
        };
    }

    const evidenceResult =
        requestBoundEvidenceEnvelopeSchema
            .safeParse(
                input.evidenceEnvelope
            );

    if (
        !evidenceResult.success
    ) {
        return {
            decision:
                "BLOCK",

            findings: [
                {
                    code:
                        "INVALID_EVIDENCE_ENVELOPE",

                    message:
                        "The provider evidence envelope is malformed.",
                },
            ],
        };
    }

    const authorization =
        authorizationVerification
            .authorization;

    const evidenceEnvelope =
        evidenceResult.data;

    const evidence =
        evidenceEnvelope
            .evidence;

    const transaction =
        transactionResult.data;

    const now =
        input.now ??
        Date.now();

    const evidenceId =
        getRequestBoundEvidenceId(
            evidence
        );

    const requestComparison = {
        authorizationRequestHash:
            authorization.requestHash,

        evidenceRequestHash:
            evidence.requestHash,

        actualRequestHash,

        authorizationMatchesActual:
            authorization.requestHash ===
            actualRequestHash,

        evidenceMatchesActual:
            evidence.requestHash ===
            actualRequestHash,
    };

    const paymentComparison = {
        recipientMatches:
            evidence.recipient
                .toLowerCase() ===
            transaction.to
                .toLowerCase(),

        amountMatches:
            evidence.amountWei ===
            transaction.valueWei,

        chainMatches:
            evidence.chainId ===
            transaction.chainId,

        calldataMatches:
            transaction.data ===
            "0x",
    };

    /*
     * ---------------------------------------------------
     * USER AUTHORIZATION LIFETIME
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
                        "AUTHORIZATION_EXPIRED",

                    message:
                        "The user's request-bound authorization has expired.",
                },
            ],

            requestComparison,

            paymentComparison,

            evidenceId,
        };
    }

    /*
     * ---------------------------------------------------
     * PROVIDER EVIDENCE TIME
     * ---------------------------------------------------
     */

    if (
        evidence.issuedAt >=
        evidence.expiresAt
    ) {
        return {
            decision:
                "BLOCK",

            findings: [
                {
                    code:
                        "INVALID_EVIDENCE_TIME",

                    message:
                        "The provider evidence has an invalid issuance or expiry interval.",
                },
            ],

            requestComparison,

            paymentComparison,

            evidenceId,
        };
    }

    if (
        evidence.expiresAt <=
        now
    ) {
        return {
            decision:
                "NEEDS_REAUTHORIZATION",

            findings: [
                {
                    code:
                        "EVIDENCE_EXPIRED",

                    message:
                        "The provider's signed payment evidence has expired.",
                },
            ],

            requestComparison,

            paymentComparison,

            evidenceId,
        };
    }

    /*
     * ---------------------------------------------------
     * PINNED PROVIDER TRUST
     * ---------------------------------------------------
     */

    const trustedPublicKey =
        input.trustedSources[
        evidence.sourceId
        ];

    if (
        !trustedPublicKey
    ) {
        return {
            decision:
                "BLOCK",

            findings: [
                {
                    code:
                        "UNTRUSTED_EVIDENCE_SOURCE",

                    message:
                        "No pinned verification key exists for the evidence source.",
                },
            ],

            requestComparison,

            paymentComparison,

            evidenceId,
        };
    }

    if (
        !verifyRequestBoundEvidenceSignature({
            envelope:
                evidenceEnvelope,

            publicKeyPem:
                trustedPublicKey,
        })
    ) {
        return {
            decision:
                "BLOCK",

            findings: [
                {
                    code:
                        "INVALID_EVIDENCE_SIGNATURE",

                    message:
                        "The provider evidence signature is invalid.",
                },
            ],

            requestComparison,

            paymentComparison,

            evidenceId,
        };
    }

    /*
     * ---------------------------------------------------
     * AUTHORIZED PROVIDER
     * ---------------------------------------------------
     */

    if (
        evidence.sourceId !==
        authorization.trustedSourceId
    ) {
        return {
            decision:
                "NEEDS_REAUTHORIZATION",

            findings: [
                {
                    code:
                        "SOURCE_NOT_AUTHORIZED",

                    message:
                        "The signed evidence came from a provider that the user did not authorize.",
                },
            ],

            requestComparison,

            paymentComparison,

            evidenceId,
        };
    }

    /*
     * ---------------------------------------------------
     * REQUEST BINDING
     * ---------------------------------------------------
     *
     * This is the core BOUND invariant.
     */

    if (
        authorization.requestHash !==
        evidence.requestHash
    ) {
        return {
            decision:
                "BLOCK",

            findings: [
                {
                    code:
                        "REQUEST_BINDING_BREAK",

                    message:
                        "The user authorization and provider evidence refer to different tool requests.",
                },
            ],

            requestComparison,

            paymentComparison,

            evidenceId,
        };
    }

    if (
        authorization.requestHash !==
        actualRequestHash ||
        evidence.requestHash !==
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
                        "The actual tool request differs from the exact request authorized by the user and signed by the provider.",
                },
            ],

            requestComparison,

            paymentComparison,

            evidenceId,
        };
    }

    if (
        authorization.toolId !==
        request.toolId ||
        evidence.toolId !==
        request.toolId ||
        authorization.method !==
        request.method ||
        evidence.method !==
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
                        "The tool identity or method differs across the authorization, evidence, and actual request.",
                },
            ],

            requestComparison,

            paymentComparison,

            evidenceId,
        };
    }

    /*
     * ---------------------------------------------------
     * PAYMENT POLICY CONSISTENCY
     * ---------------------------------------------------
     */

    if (
        authorization.chainId !==
        evidence.chainId ||
        authorization.assetType !==
        evidence.assetType ||
        authorization.assetSymbol !==
        evidence.assetSymbol
    ) {
        return {
            decision:
                "NEEDS_REAUTHORIZATION",

            findings: [
                {
                    code:
                        "PAYMENT_ASSET_NOT_AUTHORIZED",

                    message:
                        "The provider payment route differs from the user's signed authorization.",
                },
            ],

            requestComparison,

            paymentComparison,

            evidenceId,
        };
    }

    if (
        BigInt(
            evidence.amountWei
        ) >
        BigInt(
            authorization.maxAmountWei
        )
    ) {
        return {
            decision:
                "NEEDS_REAUTHORIZATION",

            findings: [
                {
                    code:
                        "AMOUNT_EXCEEDS_AUTHORIZATION",

                    message:
                        "The provider quote exceeds the user's signed spending limit.",
                },
            ],

            requestComparison,

            paymentComparison,

            evidenceId,
        };
    }

    /*
     * ---------------------------------------------------
     * EXACT TRANSACTION
     * ---------------------------------------------------
     */

    if (
        transaction.data !==
        "0x"
    ) {
        return {
            decision:
                "BLOCK",

            findings: [
                {
                    code:
                        "UNEXPECTED_NATIVE_CALLDATA",

                    message:
                        "The native provider payment contains unexpected calldata.",
                },
            ],

            requestComparison,

            paymentComparison,

            evidenceId,
        };
    }

    if (
        transaction.chainId !==
        evidence.chainId
    ) {
        return {
            decision:
                "BLOCK",

            findings: [
                {
                    code:
                        "CHAIN_PROVENANCE_BREAK",

                    message:
                        "The transaction chain differs from the provider-signed payment terms.",
                },
            ],

            requestComparison,

            paymentComparison,

            evidenceId,
        };
    }

    if (
        transaction.to
            .toLowerCase() !==
        evidence.recipient
            .toLowerCase()
    ) {
        return {
            decision:
                "BLOCK",

            findings: [
                {
                    code:
                        "RECIPIENT_PROVENANCE_BREAK",

                    message:
                        "The transaction recipient differs from the provider-signed recipient.",
                },
            ],

            requestComparison,

            paymentComparison,

            evidenceId,
        };
    }

    if (
        transaction.valueWei !==
        evidence.amountWei
    ) {
        return {
            decision:
                "BLOCK",

            findings: [
                {
                    code:
                        "AMOUNT_PROVENANCE_BREAK",

                    message:
                        "The transaction amount differs from the provider-signed amount.",
                },
            ],

            requestComparison,

            paymentComparison,

            evidenceId,
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
                    "REQUEST_AND_PAYMENT_VERIFIED",

                message:
                    "The actual tool request, user authorization, provider evidence, and native payment are mutually consistent.",
            },
        ],

        requestComparison,

        paymentComparison,

        evidenceId,
    };
}