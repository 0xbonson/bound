import assert from "node:assert/strict";

import test from "node:test";

import {
    getToolRequestHash,
    type ToolRequest,
} from "../src/core/request-bound.js";

import {
    signMppRequestAuthorization,
    verifyMppRequestBoundPayment,
    verifySignedMppRequestAuthorization,
    type MppPaymentChallenge,
    type MppRequestAuthorization,
} from "../src/core/mpp-request-bound.js";

const TEST_PRIVATE_KEY =
    (
        `0x${"22".repeat(
            32
        )}`
    ) as `0x${string}`;

const TEST_USDT =
    "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd";

const MERCHANT =
    "0x32438dE3179DF205c63e8793A20BA6885762f537";

const ORIGINAL_TARGET =
    "0x471F83E136A45a3E46Caa1A258B88e447d5D5F76";

const MUTATED_TARGET =
    "0x2222222222222222222222222222222222222222";

const ALTERNATE_RECIPIENT =
    "0x1111111111111111111111111111111111111111";

const ALTERNATE_TOKEN =
    "0x3333333333333333333333333333333333333333";

const now =
    1_800_000_000_000;

function makeRequest(
    target:
        string =
        ORIGINAL_TARGET
): ToolRequest {
    return {
        toolId:
            "bound-transaction-check",

        method:
            "simulate_transaction",

        arguments: {
            chainId:
                97,

            from:
                ORIGINAL_TARGET,

            to:
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
): MppRequestAuthorization {
    return {
        authorizationId:
            "mpp-request-bound-test",

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

        paymentToken:
            TEST_USDT,

        paymentRecipient:
            MERCHANT,

        maxAmountRaw:
            "1000000000000000",

        credentialType:
            "hash",

        validUntil:
            now +
            10 *
            60 *
            1000,
    };
}

function makeChallenge():
    MppPaymentChallenge {
    return {
        chainId:
            97,

        currency:
            TEST_USDT,

        recipient:
            MERCHANT,

        amount:
            "1000000000000000",

        credentialTypes: [
            "hash",
        ],
    };
}

async function makeBundle() {
    const request =
        makeRequest();

    const authorization =
        makeAuthorization(
            request
        );

    const signedAuthorization =
        await signMppRequestAuthorization({
            authorization,

            privateKey:
                TEST_PRIVATE_KEY,
        });

    return {
        request,
        authorization,
        signedAuthorization,
        expectedSigner:
            signedAuthorization.signer,
        challenge:
            makeChallenge(),
    };
}

test(
    "allows exact request and matching real-style MPP challenge",
    async () => {
        const bundle =
            await makeBundle();

        const result =
            await verifyMppRequestBoundPayment({
                signedAuthorization:
                    bundle
                        .signedAuthorization,

                expectedAuthorizationSigner:
                    bundle
                        .expectedSigner,

                actualRequest:
                    bundle.request,

                challenge:
                    bundle.challenge,

                now,
            });

        assert.equal(
            result.decision,
            "ALLOW"
        );

        assert.equal(
            result.findings[0]
                ?.code,
            "MPP_REQUEST_BOUND_VERIFIED"
        );

        assert.equal(
            result
                .requestComparison
                ?.matches,
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
                .paymentComparison
                ?.tokenMatches,
            true
        );

        assert.equal(
            result
                .paymentComparison
                ?.recipientMatches,
            true
        );
    }
);

test(
    "blocks changed tool argument even when MPP merchant token amount and chain stay identical",
    async () => {
        const bundle =
            await makeBundle();

        const mutatedRequest =
            makeRequest(
                MUTATED_TARGET
            );

        const result =
            await verifyMppRequestBoundPayment({
                signedAuthorization:
                    bundle
                        .signedAuthorization,

                expectedAuthorizationSigner:
                    bundle
                        .expectedSigner,

                actualRequest:
                    mutatedRequest,

                challenge:
                    bundle.challenge,

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
                .requestComparison
                ?.matches,
            false
        );

        assert.equal(
            result
                .paymentComparison
                ?.chainMatches,
            true
        );

        assert.equal(
            result
                .paymentComparison
                ?.tokenMatches,
            true
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
                ?.amountWithinAuthorization,
            true
        );
    }
);

test(
    "requires new authorization when MPP amount exceeds signed maximum",
    async () => {
        const bundle =
            await makeBundle();

        const challenge = {
            ...bundle.challenge,

            amount:
                "2000000000000000",
        };

        const result =
            await verifyMppRequestBoundPayment({
                signedAuthorization:
                    bundle
                        .signedAuthorization,

                expectedAuthorizationSigner:
                    bundle
                        .expectedSigner,

                actualRequest:
                    bundle.request,

                challenge,

                now,
            });

        assert.equal(
            result.decision,
            "NEEDS_REAUTHORIZATION"
        );

        assert.equal(
            result.findings[0]
                ?.code,
            "MPP_AMOUNT_EXCEEDS_AUTHORIZATION"
        );
    }
);

test(
    "blocks MPP recipient substitution",
    async () => {
        const bundle =
            await makeBundle();

        const challenge = {
            ...bundle.challenge,

            recipient:
                ALTERNATE_RECIPIENT,
        };

        const result =
            await verifyMppRequestBoundPayment({
                signedAuthorization:
                    bundle
                        .signedAuthorization,

                expectedAuthorizationSigner:
                    bundle
                        .expectedSigner,

                actualRequest:
                    bundle.request,

                challenge,

                now,
            });

        assert.equal(
            result.decision,
            "BLOCK"
        );

        assert.equal(
            result.findings[0]
                ?.code,
            "MPP_RECIPIENT_MISMATCH"
        );
    }
);

test(
    "blocks MPP payment token substitution",
    async () => {
        const bundle =
            await makeBundle();

        const challenge = {
            ...bundle.challenge,

            currency:
                ALTERNATE_TOKEN,
        };

        const result =
            await verifyMppRequestBoundPayment({
                signedAuthorization:
                    bundle
                        .signedAuthorization,

                expectedAuthorizationSigner:
                    bundle
                        .expectedSigner,

                actualRequest:
                    bundle.request,

                challenge,

                now,
            });

        assert.equal(
            result.decision,
            "BLOCK"
        );

        assert.equal(
            result.findings[0]
                ?.code,
            "MPP_TOKEN_MISMATCH"
        );
    }
);

test(
    "blocks MPP chain substitution",
    async () => {
        const bundle =
            await makeBundle();

        const challenge = {
            ...bundle.challenge,

            chainId:
                56,
        };

        const result =
            await verifyMppRequestBoundPayment({
                signedAuthorization:
                    bundle
                        .signedAuthorization,

                expectedAuthorizationSigner:
                    bundle
                        .expectedSigner,

                actualRequest:
                    bundle.request,

                challenge,

                now,
            });

        assert.equal(
            result.decision,
            "BLOCK"
        );

        assert.equal(
            result.findings[0]
                ?.code,
            "MPP_CHAIN_MISMATCH"
        );
    }
);

test(
    "blocks challenge that does not allow the signed hash credential type",
    async () => {
        const bundle =
            await makeBundle();

        const challenge = {
            ...bundle.challenge,

            credentialTypes: [
                "transaction",
            ],
        };

        const result =
            await verifyMppRequestBoundPayment({
                signedAuthorization:
                    bundle
                        .signedAuthorization,

                expectedAuthorizationSigner:
                    bundle
                        .expectedSigner,

                actualRequest:
                    bundle.request,

                challenge,

                now,
            });

        assert.equal(
            result.decision,
            "BLOCK"
        );

        assert.equal(
            result.findings[0]
                ?.code,
            "MPP_CREDENTIAL_TYPE_MISMATCH"
        );
    }
);

test(
    "requires new authorization after user authorization expires",
    async () => {
        const bundle =
            await makeBundle();

        const expiredAuthorization: MppRequestAuthorization = {
            ...bundle
                .authorization,

            authorizationId:
                "expired-mpp-authorization",

            validUntil:
                now -
                1,
        };

        const expiredSigned =
            await signMppRequestAuthorization({
                authorization:
                    expiredAuthorization,

                privateKey:
                    TEST_PRIVATE_KEY,
            });

        const result =
            await verifyMppRequestBoundPayment({
                signedAuthorization:
                    expiredSigned,

                expectedAuthorizationSigner:
                    expiredSigned.signer,

                actualRequest:
                    bundle.request,

                challenge:
                    bundle.challenge,

                now,
            });

        assert.equal(
            result.decision,
            "NEEDS_REAUTHORIZATION"
        );

        assert.equal(
            result.findings[0]
                ?.code,
            "MPP_AUTHORIZATION_EXPIRED"
        );
    }
);

test(
    "rejects authorization fields changed after EIP-712 signing",
    async () => {
        const bundle =
            await makeBundle();

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
            await verifySignedMppRequestAuthorization({
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
                "INVALID_MPP_AUTHORIZATION_SIGNATURE"
            );
        }
    }
);

test(
    "rejects authorization signed by a different wallet",
    async () => {
        const bundle =
            await makeBundle();

        const unrelatedPrivateKey =
            (
                `0x${"33".repeat(
                    32
                )}`
            ) as `0x${string}`;

        const attackerSigned =
            await signMppRequestAuthorization({
                authorization:
                    bundle
                        .authorization,

                privateKey:
                    unrelatedPrivateKey,
            });

        const result =
            await verifySignedMppRequestAuthorization({
                envelope:
                    attackerSigned,

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
                "UNAUTHORIZED_MPP_SIGNER"
            );
        }
    }
);