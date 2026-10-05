import assert from "node:assert/strict";
import test from "node:test";

import {
    decodeFunctionData,
} from "viem";

import {
    BOUND_INTENT_REGISTRY_ABI,
    BOUND_INTENT_REGISTRY_ADDRESS,
    buildBoundIntentRegistryCommit,
    getBoundIntentId,
} from "../src/core/intent-registry.js";

const authorizationId =
    "11111111-2222-4333-8444-555555555555";

const authorizer =
    "0x1111111111111111111111111111111111111111";

const paymentToken =
    "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd";

const paymentRecipient =
    "0x32438dE3179DF205c63e8793A20BA6885762f537";

const requestHash =
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

test(
    "derives deterministic authorizer intent commitment id",
    () => {
        const first =
            getBoundIntentId(
                authorizationId
            );

        const second =
            getBoundIntentId(
                authorizationId
            );

        const different =
            getBoundIntentId(
                "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
            );

        assert.equal(
            first,
            second
        );

        assert.notEqual(
            first,
            different
        );
    }
);

test(
    "encodes the exact signed payment boundary for BOUNDIntentRegistry",
    () => {
        const commit =
            buildBoundIntentRegistryCommit({
                authorizationId,
                authorizer,
                requestHash,
                paymentToken,
                paymentRecipient,
                maxAmountRaw:
                    "1000000000000000",

                validUntil:
                    1_800_000_000_000,
            });

        assert.equal(
            commit.chainId,
            97
        );

        assert.equal(
            commit.contract,
            BOUND_INTENT_REGISTRY_ADDRESS
        );

        assert.equal(
            commit.requestHash,
            requestHash
        );

        const decoded =
            decodeFunctionData({
                abi:
                    BOUND_INTENT_REGISTRY_ABI,

                data:
                    commit.data,
            });

        assert.equal(
            decoded.functionName,
            "commitIntent"
        );

        assert.deepEqual(
            decoded.args,
            [
                commit.intentId,
                requestHash,
                commit.paymentToken,
                commit.paymentRecipient,
                1_000_000_000_000_000n,
                1_800_000_000n,
            ]
        );
    }
);
