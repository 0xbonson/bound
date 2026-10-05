import assert from "node:assert/strict";
import test from "node:test";

import type {
    UniversalTransactionFacts,
} from "../src/chain/universal-transaction-intelligence.js";

import type {
    TransactionInterpretation,
} from "../src/chain/transaction-interpretation.js";

import type {
    LensAgentResult,
} from "../src/agent/lens-agent.js";

import type {
    AgentPlannerResult,
} from "../src/agent/agent-planner.js";

import type {
    AgentObservation,
} from "../src/agent/agent-observation.js";

import {
    buildPaidTransactionAnalysisObservation,
} from "../src/agent/agent-observation.js";



import {
    getAgentTool,
} from "../src/agent/agent-tool-registry.js";

import {
    buildRegisteredPaidToolRequest,
} from "../src/agent/agent-tool-registry.js";

import {
    runAgentRuntime,
    type AgentRuntimeDependencies,
} from "../src/agent/agent-runtime.js";


const HASH =
    "0xc26914982ccea9c13aee846880a904136f145f8699661c9d1f0db96138aef825";

const RECIPIENT =
    "0x9Ac64Cc6e4415144C455Bd8E4837Fea55603e5c3";


const facts = {
    subject: {
        transactionHash:
            HASH,

        chainId:
            97,

        network:
            "BNB Smart Chain Testnet",
    },

    transaction: {
        to:
            RECIPIENT,
    },
} as unknown as
    UniversalTransactionFacts;


const interpretation = {
    protocol: {
        status:
            "identified",
    },
} as unknown as
    TransactionInterpretation;


function lensResult(
    status:
        "ANSWERED" |
        "NEEDS_MORE_EVIDENCE",

    answer:
        string
):
    LensAgentResult {
    return {
        version:
            "bound.lens-agent.v1",

        status,

        answer,

        evidence: [],

        limitations:
            status ===
            "NEEDS_MORE_EVIDENCE"
                ? [
                    "More evidence is required.",
                ]
                : [],

        moreEvidenceNeeded:
            status ===
            "NEEDS_MORE_EVIDENCE",

        toolNeeded:
            false,

        model:
            "test-model",

        groundedInLensFacts:
            true,

        securityDecision:
            false,

        securityVerdictRequested:
            false,
    };
}


const runtimeObservation:
    AgentObservation = {
    version:
        "bound.agent-observation.v1",

    toolId:
        "recipient_code_lookup",

    source:
        "RUNTIME_TOOL",

    status:
        "COMPLETED",

    capability:
        "recipient_bytecode",

    summary:
        "The transaction recipient currently has deployed EVM bytecode.",

    result: {
        address:
            RECIPIENT,

        hasDeployedBytecode:
            true,
    },
};


function freePlan():
    AgentPlannerResult {
    const tool =
        getAgentTool(
            "recipient_code_lookup"
        );

    assert.ok(
        tool
    );

    return {
        version:
            "bound.agent-planner.v1",

        decision:
            "USE_FREE_TOOL",

        requiredCapability:
            "recipient_bytecode",

        reason:
            "Current recipient bytecode state is required.",

        selectedTool:
            tool,

        toolNeeded:
            true,

        requiresAuthorization:
            false,

        model:
            "test-model",

        hostValidated:
            true,
    };
}


function paidPlan():
    AgentPlannerResult {
    const tool =
        getAgentTool(
            "transaction_analysis_paid"
        );

    assert.ok(
        tool
    );

    return {
        version:
            "bound.agent-planner.v1",

        decision:
            "REQUEST_PAID_TOOL",

        requiredCapability:
            "paid_transaction_analysis",

        reason:
            "The user requested the registered paid analysis capability.",

        selectedTool:
            tool,

        toolNeeded:
            true,

        requiresAuthorization:
            true,

        model:
            "test-model",

        hostValidated:
            true,
    };
}


function noToolPlan():
    AgentPlannerResult {
    return {
        version:
            "bound.agent-planner.v1",

        decision:
            "NO_SUITABLE_TOOL",

        requiredCapability:
            "security_verdict",

        reason:
            "No registered tool provides a security verdict.",

        selectedTool:
            null,

        toolNeeded:
            false,

        requiresAuthorization:
            false,

        model:
            "test-model",

        hostValidated:
            true,
    };
}


test(
    "runtime answers immediately when grounded evidence is already sufficient",
    async () => {
        let planCalled =
            false;

        const dependencies:
            AgentRuntimeDependencies = {
            ask:
                async () =>
                    lensResult(
                        "ANSWERED",
                        "The current evidence answers the question."
                    ),

            plan:
                async () => {
                    planCalled =
                        true;

                    throw new Error(
                        "Planner should not run."
                    );
                },

            executeFree:
                async () => {
                    throw new Error(
                        "Free tool should not run."
                    );
                },

            buildPaidRequest:
                buildRegisteredPaidToolRequest,
        };

        const result =
            await runAgentRuntime(
                {
                    goal:
                        "What happened?",

                    facts,

                    interpretation,

                    observations: [],
                },

                dependencies
            );

        assert.equal(
            result.status,
            "ANSWERED"
        );

        assert.equal(
            planCalled,
            false
        );

        assert.equal(
            result.autoPayment,
            false
        );
    }
);


test(
    "runtime performs free action observes result and reasons again",
    async () => {
        let askCount =
            0;

        let planCount =
            0;

        let executeCount =
            0;

        const dependencies:
            AgentRuntimeDependencies = {
            ask:
                async (
                    input
                ) => {
                    askCount +=
                        1;

                    if (
                        askCount ===
                        1
                    ) {
                        assert.equal(
                            input
                                .observations
                                ?.length,
                            0
                        );

                        return lensResult(
                            "NEEDS_MORE_EVIDENCE",
                            "Current evidence does not establish current recipient bytecode."
                        );
                    }

                    assert.equal(
                        input
                            .observations
                            ?.length,
                        1
                    );

                    assert.equal(
                        input
                            .observations?.[0]
                            ?.toolId,
                        "recipient_code_lookup"
                    );

                    return lensResult(
                        "ANSWERED",
                        "The transaction recipient currently has deployed EVM bytecode."
                    );
                },

            plan:
                async () => {
                    planCount +=
                        1;

                    return freePlan();
                },

            executeFree:
                async () => {
                    executeCount +=
                        1;

                    return runtimeObservation;
                },

            buildPaidRequest:
                buildRegisteredPaidToolRequest,
        };

        const result =
            await runAgentRuntime(
                {
                    goal:
                        "Does the transaction recipient currently have deployed EVM bytecode?",

                    facts,

                    interpretation,

                    observations: [],
                },

                dependencies
            );

        assert.equal(
            result.status,
            "ANSWERED"
        );

        assert.equal(
            askCount,
            2
        );

        assert.equal(
            planCount,
            1
        );

        assert.equal(
            executeCount,
            1
        );

        assert.equal(
            result
                .observations
                .length,
            1
        );

        assert.ok(
            result.activity
                .some(
                    (
                        item
                    ) =>
                        item.phase ===
                        "ACT"
                )
        );

        assert.ok(
            result.activity
                .some(
                    (
                        item
                    ) =>
                        item.phase ===
                        "OBSERVE"
                )
        );
    }
);


test(
    "runtime pauses at Guard boundary instead of executing paid capability",
    async () => {
        let freeExecutionCalled =
            false;

        const dependencies:
            AgentRuntimeDependencies = {
            ask:
                async () =>
                    lensResult(
                        "NEEDS_MORE_EVIDENCE",
                        "Paid analysis has not been performed."
                    ),

            plan:
                async () =>
                    paidPlan(),

            executeFree:
                async () => {
                    freeExecutionCalled =
                        true;

                    throw new Error(
                        "Free executor must not run."
                    );
                },

            buildPaidRequest:
                buildRegisteredPaidToolRequest,
        };

        const result =
            await runAgentRuntime(
                {
                    goal:
                        "Use the paid transaction analysis capability.",

                    facts,

                    interpretation,

                    observations: [],
                },

                dependencies
            );

        assert.equal(
            result.status,
            "PAUSED_FOR_AUTHORIZATION"
        );

        assert.equal(
            freeExecutionCalled,
            false
        );

        assert.equal(
            result.autoPayment,
            false
        );

        assert.equal(
            result.paidRequest
                ?.toolId,
            "bound-transaction-analysis"
        );

        assert.equal(
            result.paidRequest
                ?.method,
            "analyze_transaction"
        );
    }
);


test(
    "runtime stops when no registered tool can satisfy the evidence gap",
    async () => {
        const dependencies:
            AgentRuntimeDependencies = {
            ask:
                async () =>
                    lensResult(
                        "NEEDS_MORE_EVIDENCE",
                        "The evidence cannot establish a safety verdict."
                    ),

            plan:
                async () =>
                    noToolPlan(),

            executeFree:
                async () => {
                    throw new Error(
                        "No free tool should execute."
                    );
                },

            buildPaidRequest:
                buildRegisteredPaidToolRequest,
        };

        const result =
            await runAgentRuntime(
                {
                    goal:
                        "Is this transaction safe?",

                    facts,

                    interpretation,

                    observations: [],
                },

                dependencies
            );

        assert.equal(
            result.status,
            "NEEDS_MORE_EVIDENCE"
        );

        assert.equal(
            result.paidRequest,
            null
        );

        assert.equal(
            result.autoPayment,
            false
        );
    }
);


test(
    "runtime independently refuses a repeated completed tool",
    async () => {
        const dependencies:
            AgentRuntimeDependencies = {
            ask:
                async () =>
                    lensResult(
                        "NEEDS_MORE_EVIDENCE",
                        "More evidence requested."
                    ),

            plan:
                async () =>
                    freePlan(),

            executeFree:
                async () =>
                    runtimeObservation,

            buildPaidRequest:
                buildRegisteredPaidToolRequest,
        };

        await assert.rejects(
            () =>
                runAgentRuntime(
                    {
                        goal:
                            "Check recipient bytecode again.",

                        facts,

                        interpretation,

                        observations: [
                            runtimeObservation,
                        ],
                    },

                    dependencies
                ),

            /AGENT_RUNTIME_REFUSED_REPEATED_TOOL/
        );
    }
);

test(
    "runtime answers from completed paid evidence without another purchase",
    async () => {
        const rpcResult = {
            status:
                "0x1",

            transactionHash:
                HASH,
        };


        const paidObservation =
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
                        HASH,
                },

                rpcResult,
            });


        let plannerCalled =
            false;

        let freeExecutionCalled =
            false;


        const dependencies:
            AgentRuntimeDependencies = {
            ask:
                async (
                    input
                ) => {
                    const observation =
                        (
                            input.observations ??
                            []
                        )
                            .find(
                                (
                                    item
                                ) =>
                                    item.toolId ===
                                    "transaction_analysis_paid"
                            );


                    assert.ok(
                        observation
                    );


                    if (
                        observation.toolId !==
                        "transaction_analysis_paid"
                    ) {
                        throw new Error(
                            "Expected paid transaction analysis observation."
                        );
                    }


                    assert.equal(
                        observation.capability,
                        "paid_transaction_analysis"
                    );


                    assert.deepEqual(
                        observation.result.rpcResult,
                        rpcResult
                    );


                    return lensResult(
                        "ANSWERED",
                        "The paid provider returned the requested transaction evidence."
                    );
                },


            plan:
                async () => {
                    plannerCalled =
                        true;

                    return paidPlan();
                },


            executeFree:
                async () => {
                    freeExecutionCalled =
                        true;

                    throw new Error(
                        "Free executor must not run."
                    );
                },


            buildPaidRequest:
                buildRegisteredPaidToolRequest,
        };


        const result =
            await runAgentRuntime(
                {
                    goal:
                        "Use paid provider evidence to finish the transaction analysis.",

                    facts,

                    interpretation,

                    observations: [
                        paidObservation,
                    ],
                },

                dependencies
            );


        assert.equal(
            result.status,
            "ANSWERED"
        );


        assert.equal(
            result.lensAgent.answer,
            "The paid provider returned the requested transaction evidence."
        );


        assert.equal(
            plannerCalled,
            false
        );


        assert.equal(
            freeExecutionCalled,
            false
        );


        assert.equal(
            result.paidRequest,
            null
        );


        assert.equal(
            result.observations
                .some(
                    (
                        item
                    ) =>
                        item.toolId ===
                        "transaction_analysis_paid"
                ),
            true
        );
    }
);


test(
    "runtime refuses to purchase an already completed paid tool again",
    async () => {
        const paidObservation =
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
                        HASH,
                },

                rpcResult: {
                    status:
                        "0x1",

                    transactionHash:
                        HASH,
                },
            });


        const dependencies:
            AgentRuntimeDependencies = {
            ask:
                async () =>
                    lensResult(
                        "NEEDS_MORE_EVIDENCE",
                        "The model incorrectly asks for the paid capability again."
                    ),


            plan:
                async () =>
                    paidPlan(),


            executeFree:
                async () => {
                    throw new Error(
                        "Free executor must not run."
                    );
                },


            buildPaidRequest:
                buildRegisteredPaidToolRequest,
        };


        await assert.rejects(
            () =>
                runAgentRuntime(
                    {
                        goal:
                            "Do not repurchase evidence that already exists.",

                        facts,

                        interpretation,

                        observations: [
                            paidObservation,
                        ],
                    },

                    dependencies
                ),

            /AGENT_RUNTIME_REFUSED_REPEATED_TOOL:transaction_analysis_paid/
        );
    }
);
