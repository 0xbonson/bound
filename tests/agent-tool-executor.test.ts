import assert from "node:assert/strict";
import test from "node:test";

import type {
    UniversalTransactionFacts,
} from "../src/chain/universal-transaction-intelligence.js";

import {
    executeFreeAgentTool,
} from "../src/agent/agent-tool-executor.js";


const RECIPIENT =
    "0x9Ac64Cc6e4415144C455Bd8E4837Fea55603e5c3";


const facts = {
    subject: {
        chainId:
            97,
    },

    transaction: {
        to:
            RECIPIENT,
    },
} as unknown as
    UniversalTransactionFacts;


test(
    "recipient code lookup records deployed bytecode",
    async () => {
        const result =
            await executeFreeAgentTool(
                {
                    toolId:
                        "recipient_code_lookup",

                    facts,
                },

                {
                    getBytecode:
                        async (
                            input
                        ) => {
                            assert.equal(
                                input.chainId,
                                97
                            );

                            assert.equal(
                                input.address,
                                RECIPIENT
                            );

                            return "0x60016000";
                        },
                }
            );

        assert.equal(
            result.toolId,
            "recipient_code_lookup"
        );

        assert.equal(
            result.status,
            "COMPLETED"
        );

        if (
            result.toolId !==
            "recipient_code_lookup"
        ) {
            assert.fail(
                "Expected recipient code observation."
            );
        }

        assert.equal(
            result.result
                .hasDeployedBytecode,
            true
        );
    }
);


test(
    "recipient code lookup records empty bytecode without inventing meaning",
    async () => {
        const result =
            await executeFreeAgentTool(
                {
                    toolId:
                        "recipient_code_lookup",

                    facts,
                },

                {
                    getBytecode:
                        async () =>
                            "0x",
                }
            );

        if (
            result.toolId !==
            "recipient_code_lookup"
        ) {
            assert.fail(
                "Expected recipient code observation."
            );
        }

        assert.equal(
            result.result
                .hasDeployedBytecode,
            false
        );

        assert.doesNotMatch(
            result.summary,
            /safe|legit|trusted/i
        );
    }
);


test(
    "recipient code lookup is not applicable without destination",
    async () => {
        let called =
            false;

        const result =
            await executeFreeAgentTool(
                {
                    toolId:
                        "recipient_code_lookup",

                    facts: {
                        ...facts,

                        transaction: {
                            ...facts.transaction,

                            to:
                                null,
                        },
                    },
                },

                {
                    getBytecode:
                        async () => {
                            called =
                                true;

                            return "0x6001";
                        },
                }
            );

        assert.equal(
            called,
            false
        );

        assert.equal(
            result.status,
            "NOT_APPLICABLE"
        );
    }
);


test(
    "free executor refuses paid tool execution",
    async () => {
        await assert.rejects(
            () =>
                executeFreeAgentTool({
                    toolId:
                        "transaction_analysis_paid",

                    facts,
                }),

            /AGENT_TOOL_IS_NOT_FREE/
        );
    }
);
