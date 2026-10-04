import assert from "node:assert/strict";
import test from "node:test";

import {
    buildGuardAuthorizationDraft,
    buildRuntimeGuardPlanRecord,
} from "../src/core/guard-handoff.js";

import {
    buildTransactionAnalysisToolRequest,
} from "../src/core/intent-manifest.js";

import {
    getToolRequestHash,
} from "../src/core/request-bound.js";

import {
    type MppPaymentChallenge,
} from "../src/core/mpp-request-bound.js";


const TX_HASH =
    "0xc26914982ccea9c13aee846880a904136f145f8699661c9d1f0db96138aef825";

const TEST_USDT =
    "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd";

const MERCHANT =
    "0x32438dE3179DF205c63e8793A20BA6885762f537";

const WALLET =
    "0x000000000000000000000000000000000000dEaD" as
        `0x${string}`;

const NOW =
    1_800_000_000_000;


test(
    "preserves exact paid request from runtime Guard plan into authorization draft",
    () => {
        const paidRequest =
            buildTransactionAnalysisToolRequest(
                TX_HASH
            );

        const plan =
            buildRuntimeGuardPlanRecord({
                id:
                    "00000000-0000-4000-8000-000000000001",

                now:
                    NOW,

                lifetimeMs:
                    10 *
                    60 *
                    1000,

                task:
                    "Obtain evidence from the registered paid provider.",

                request:
                    paidRequest,

                model:
                    "test-planner",

                summary:
                    "Paid provider evidence is required.",

                activity: [],
            });

        const quote:
            MppPaymentChallenge = {
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

        const {
            draft,
            authorization,
        } =
            buildGuardAuthorizationDraft({
                plan,

                expectedSigner:
                    WALLET,

                quote: {
                    payment:
                        quote,

                    challengeId:
                        "test-challenge",
                },

                authorizationId:
                    "00000000-0000-4000-8000-000000000002",

                now:
                    NOW,

                draftLifetimeMs:
                    5 *
                    60 *
                    1000,

                userAuthorizationLifetimeMs:
                    5 *
                    60 *
                    1000,
            });

        const runtimeHash =
            getToolRequestHash(
                paidRequest
            );

        const guardHash =
            getToolRequestHash(
                plan.request
            );

        const draftHash =
            getToolRequestHash(
                draft.request
            );

        assert.equal(
            plan.id,
            draft.planId
        );

        assert.equal(
            runtimeHash,
            guardHash
        );

        assert.equal(
            guardHash,
            draftHash
        );

        assert.equal(
            plan.requestHash,
            runtimeHash
        );

        assert.equal(
            draft.requestHash,
            runtimeHash
        );

        assert.equal(
            authorization.requestHash,
            runtimeHash
        );

        assert.equal(
            authorization.toolId,
            paidRequest.toolId
        );

        assert.equal(
            authorization.method,
            paidRequest.method
        );

        /*
         * Preparing a draft must not cross the human
         * authorization or payment boundary.
         */
        assert.equal(
            "signature" in draft,
            false
        );

        assert.equal(
            "signedAuthorization" in draft,
            false
        );

        assert.equal(
            "paymentTxHash" in draft,
            false
        );
    }
);
