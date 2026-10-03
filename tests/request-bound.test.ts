import {
    generateKeyPairSync,
} from "node:crypto";

import assert from "node:assert/strict";

import test from "node:test";

import {
    getToolRequestHash,
    signRequestBoundAuthorization,
    signRequestBoundEvidence,
    verifyRequestBoundPayment,
    verifySignedRequestBoundAuthorization,
    type RequestBoundAuthorization,
    type RequestBoundEvidence,
    type ToolRequest,
} from "../src/core/request-bound.js";

import {
    type RawNativeTransaction,
} from "../src/core/native.js";

const TEST_PRIVATE_KEY =
    (
        `0x${"11".repeat(
            32
        )}`
    ) as `0x${string}`;

const SOURCE_ID =
    "bound-preflight-provider";

const MERCHANT =
    "0x32438dE3179DF205c63e8793A20BA6885762f537";

const ORIGINAL_TARGET =
    "0x471F83E136A45a3E46Caa1A258B88e447d5D5F76";

const MUTATED_TARGET =
    "0x2222222222222222222222222222222222222222";

const now =
    1_800_000_000_000;

const {
    publicKey,
    privateKey,
} =
    generateKeyPairSync(
        "ed25519"
    );

const PUBLIC_KEY_PEM =
    publicKey
        .export({
            format:
                "pem",

            type:
                "spki",
        })
        .toString();

const PRIVATE_KEY_PEM =
    privateKey
        .export({
            format:
                "pem",

            type:
                "pkcs8",
        })
        .toString();

function makeRequest(
    target:
        string =
        ORIGINAL_TARGET
): ToolRequest {
    return {
        toolId:
            "bound-chain-preflight",

        method:
            "simulate_transaction",

        arguments: {
            chainId:
                97,

            target,

            valueWei:
                "0",

            data:
                "0x",
        },
    };
}

function makeAuthorization(
    request:
        ToolRequest
): RequestBoundAuthorization {
    return {
        authorizationId:
            "request-bound-test-auth",

        requestHash:
            getToolRequestHash(
                request
            ),

        toolId:
            request.toolId,

        method:
            request.method,

        chainId:
            97,

        assetType:
            "native",

        assetSymbol:
            "tBNB",

        maxAmountWei:
            "5000000000000000",

        trustedSourceId:
            SOURCE_ID,

        validUntil:
            now +
            10 * 60 * 1000,
    };
}

function makeEvidence(
    request:
        ToolRequest
): RequestBoundEvidence {
    return {
        sourceId:
            SOURCE_ID,

        requestHash:
            getToolRequestHash(
                request
            ),

        toolId:
            request.toolId,

        method:
            request.method,

        chainId:
            97,

        assetType:
            "native",

        assetSymbol:
            "tBNB",

        recipient:
            MERCHANT,

        amountWei:
            "1000000000000000",

        nonce:
            "request-bound-test-quote",

        issuedAt:
            now -
            1_000,

        expiresAt:
            now +
            2 * 60 * 1000,
    };
}

function makeTransaction():
    RawNativeTransaction {
    return {
        chainId:
            97,

        to:
            MERCHANT,

        valueWei:
            "1000000000000000",

        data:
            "0x",
    };
}

async function makeSignedBundle() {
    const request =
        makeRequest();

    const authorization =
        makeAuthorization(
            request
        );

    const signedAuthorization =
        await signRequestBoundAuthorization({
            authorization,

            privateKey:
                TEST_PRIVATE_KEY,
        });

    const evidence =
        makeEvidence(
            request
        );

    const evidenceEnvelope =
        signRequestBoundEvidence({
            evidence,

            privateKeyPem:
                PRIVATE_KEY_PEM,
        });

    return {
        request,
        authorization,
        signedAuthorization,
        evidence,
        evidenceEnvelope,
        expectedSigner:
            signedAuthorization.signer,
    };
}

test(
    "canonical request hash ignores object key insertion order",
    () => {
        const first =
            getToolRequestHash({
                toolId:
                    "tool",

                method:
                    "method",

                arguments: {
                    a:
                        1,

                    b:
                        2,
                },
            });

        const second =
            getToolRequestHash({
                toolId:
                    "tool",

                method:
                    "method",

                arguments: {
                    b:
                        2,

                    a:
                        1,
                },
            });

        assert.equal(
            first,
            second
        );
    }
);

test(
    "changing an exact tool argument changes the request hash",
    () => {
        const original =
            getToolRequestHash(
                makeRequest(
                    ORIGINAL_TARGET
                )
            );

        const mutated =
            getToolRequestHash(
                makeRequest(
                    MUTATED_TARGET
                )
            );

        assert.notEqual(
            original,
            mutated
        );
    }
);

test(
    "allows an exact request with matching authorization, provider evidence, and payment",
    async () => {
        const bundle =
            await makeSignedBundle();

        const result =
            await verifyRequestBoundPayment({
                signedAuthorization:
                    bundle
                        .signedAuthorization,

                expectedAuthorizationSigner:
                    bundle
                        .expectedSigner,

                request:
                    bundle.request,

                evidenceEnvelope:
                    bundle
                        .evidenceEnvelope,

                trustedSources: {
                    [SOURCE_ID]:
                        PUBLIC_KEY_PEM,
                },

                transaction:
                    makeTransaction(),

                now,
            });

        assert.equal(
            result.decision,
            "ALLOW"
        );

        assert.equal(
            result.findings[0]
                ?.code,
            "REQUEST_AND_PAYMENT_VERIFIED"
        );
    }
);

test(
    "blocks a changed tool argument even when merchant, price, chain, and payment remain identical",
    async () => {
        const bundle =
            await makeSignedBundle();

        const mutatedRequest =
            makeRequest(
                MUTATED_TARGET
            );

        const result =
            await verifyRequestBoundPayment({
                signedAuthorization:
                    bundle
                        .signedAuthorization,

                expectedAuthorizationSigner:
                    bundle
                        .expectedSigner,

                request:
                    mutatedRequest,

                evidenceEnvelope:
                    bundle
                        .evidenceEnvelope,

                trustedSources: {
                    [SOURCE_ID]:
                        PUBLIC_KEY_PEM,
                },

                transaction:
                    makeTransaction(),

                now,
            });

        assert.equal(
            result.decision,
            "BLOCK"
        );

        assert.equal(
            result.findings[0]
                ?.code,
            "REQUEST_PROVENANCE_BREAK"
        );

        assert.equal(
            result
                .paymentComparison
                ?.recipientMatches,
            true
        );

        assert.equal(
            result
                .paymentComparison
                ?.amountMatches,
            true
        );

        assert.equal(
            result
                .paymentComparison
                ?.chainMatches,
            true
        );

        assert.equal(
            result
                .requestComparison
                ?.authorizationMatchesActual,
            false
        );
    }
);

test(
    "blocks transaction amount changed after provider signing",
    async () => {
        const bundle =
            await makeSignedBundle();

        const transaction =
            makeTransaction();

        transaction.valueWei =
            "4321000000000000";

        const result =
            await verifyRequestBoundPayment({
                signedAuthorization:
                    bundle
                        .signedAuthorization,

                expectedAuthorizationSigner:
                    bundle
                        .expectedSigner,

                request:
                    bundle.request,

                evidenceEnvelope:
                    bundle
                        .evidenceEnvelope,

                trustedSources: {
                    [SOURCE_ID]:
                        PUBLIC_KEY_PEM,
                },

                transaction,

                now,
            });

        assert.equal(
            result.decision,
            "BLOCK"
        );

        assert.equal(
            result.findings[0]
                ?.code,
            "AMOUNT_PROVENANCE_BREAK"
        );
    }
);

test(
    "blocks transaction recipient changed after provider signing",
    async () => {
        const bundle =
            await makeSignedBundle();

        const transaction =
            makeTransaction();

        transaction.to =
            MUTATED_TARGET;

        const result =
            await verifyRequestBoundPayment({
                signedAuthorization:
                    bundle
                        .signedAuthorization,

                expectedAuthorizationSigner:
                    bundle
                        .expectedSigner,

                request:
                    bundle.request,

                evidenceEnvelope:
                    bundle
                        .evidenceEnvelope,

                trustedSources: {
                    [SOURCE_ID]:
                        PUBLIC_KEY_PEM,
                },

                transaction,

                now,
            });

        assert.equal(
            result.decision,
            "BLOCK"
        );

        assert.equal(
            result.findings[0]
                ?.code,
            "RECIPIENT_PROVENANCE_BREAK"
        );
    }
);

test(
    "rejects provider evidence changed after Ed25519 signing",
    async () => {
        const bundle =
            await makeSignedBundle();

        const tamperedEnvelope = {
            ...bundle
                .evidenceEnvelope,

            evidence: {
                ...bundle
                    .evidenceEnvelope
                    .evidence,

                amountWei:
                    "2000000000000000",
            },
        };

        const result =
            await verifyRequestBoundPayment({
                signedAuthorization:
                    bundle
                        .signedAuthorization,

                expectedAuthorizationSigner:
                    bundle
                        .expectedSigner,

                request:
                    bundle.request,

                evidenceEnvelope:
                    tamperedEnvelope,

                trustedSources: {
                    [SOURCE_ID]:
                        PUBLIC_KEY_PEM,
                },

                transaction:
                    makeTransaction(),

                now,
            });

        assert.equal(
            result.decision,
            "BLOCK"
        );

        assert.equal(
            result.findings[0]
                ?.code,
            "INVALID_EVIDENCE_SIGNATURE"
        );
    }
);

test(
    "rejects request authorization fields changed after EIP-712 signing",
    async () => {
        const bundle =
            await makeSignedBundle();

        const mutatedEnvelope = {
            ...bundle
                .signedAuthorization,

            authorization: {
                ...bundle
                    .signedAuthorization
                    .authorization,

                requestHash:
                    getToolRequestHash(
                        makeRequest(
                            MUTATED_TARGET
                        )
                    ),
            },
        };

        const result =
            await verifySignedRequestBoundAuthorization({
                envelope:
                    mutatedEnvelope,

                expectedSigner:
                    bundle
                        .expectedSigner,
            });

        assert.equal(
            result.valid,
            false
        );

        if (
            !result.valid
        ) {
            assert.equal(
                result.code,
                "INVALID_AUTHORIZATION_SIGNATURE"
            );
        }
    }
);

test(
    "rejects evidence from an untrusted provider key",
    async () => {
        const bundle =
            await makeSignedBundle();

        const result =
            await verifyRequestBoundPayment({
                signedAuthorization:
                    bundle
                        .signedAuthorization,

                expectedAuthorizationSigner:
                    bundle
                        .expectedSigner,

                request:
                    bundle.request,

                evidenceEnvelope:
                    bundle
                        .evidenceEnvelope,

                trustedSources: {},

                transaction:
                    makeTransaction(),

                now,
            });

        assert.equal(
            result.decision,
            "BLOCK"
        );

        assert.equal(
            result.findings[0]
                ?.code,
            "UNTRUSTED_EVIDENCE_SOURCE"
        );
    }
);

test(
    "requires fresh evidence when the provider quote expires",
    async () => {
        const bundle =
            await makeSignedBundle();

        const expiredEvidence: RequestBoundEvidence = {
            ...bundle
                .evidence,

            nonce:
                "expired-evidence",

            issuedAt:
                now -
                120_000,

            expiresAt:
                now -
                1_000,
        };

        const expiredEnvelope =
            signRequestBoundEvidence({
                evidence:
                    expiredEvidence,

                privateKeyPem:
                    PRIVATE_KEY_PEM,
            });

        const result =
            await verifyRequestBoundPayment({
                signedAuthorization:
                    bundle
                        .signedAuthorization,

                expectedAuthorizationSigner:
                    bundle
                        .expectedSigner,

                request:
                    bundle.request,

                evidenceEnvelope:
                    expiredEnvelope,

                trustedSources: {
                    [SOURCE_ID]:
                        PUBLIC_KEY_PEM,
                },

                transaction:
                    makeTransaction(),

                now,
            });

        assert.equal(
            result.decision,
            "NEEDS_REAUTHORIZATION"
        );

        assert.equal(
            result.findings[0]
                ?.code,
            "EVIDENCE_EXPIRED"
        );
    }
);