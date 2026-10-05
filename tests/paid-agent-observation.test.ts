import assert from "node:assert/strict";
import test from "node:test";

import {
    buildPaidTransactionAnalysisObservation,
    getCompletedAgentToolIds,
} from "../src/agent/agent-observation.js";


test(
    "paid transaction analysis becomes grounded Agent evidence",
    () => {
        const observation =
            buildPaidTransactionAnalysisObservation({
                source:
                    "live-bsc-testnet-rpc",

                network:
                    "BNB Smart Chain Testnet",

                chainId:
                    97,

                blockNumber:
                    "123456",

                checkedTransaction: {
                    hash:
                        "0xabc",
                },

                rpcResult: {
                    status:
                        "0x1",
                },
            });


        assert.equal(
            observation.toolId,
            "transaction_analysis_paid"
        );

        assert.equal(
            observation.source,
            "MPP_PAID_TOOL"
        );

        assert.equal(
            observation.capability,
            "paid_transaction_analysis"
        );

        assert.equal(
            observation.status,
            "COMPLETED"
        );

        assert.equal(
            observation.result.chainId,
            97
        );

        assert.deepEqual(
            getCompletedAgentToolIds([
                observation,
            ]),
            [
                "transaction_analysis_paid",
            ]
        );
    }
);
