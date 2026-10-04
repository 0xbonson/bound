import assert from "node:assert/strict";
import test from "node:test";

import {
    buildRegisteredPaidToolRequest,
    getAgentTool,
    listAgentTools,
} from "../src/agent/agent-tool-registry.js";

import {
    buildAgentPlannerContext,
    parseAgentPlannerModelResponse,
    planAgentNextStep,
} from "../src/agent/agent-planner.js";

import type {
    AgentObservation,
} from "../src/agent/agent-observation.js";


const baseInput = {
    goal:
        "Find out what evidence is still missing.",

    subject: {
        transactionHash:
            "0xc26914982ccea9c13aee846880a904136f145f8699661c9d1f0db96138aef825",

        chainId:
            97,

        network:
            "BNB Smart Chain Testnet",
    },

    lensAgent: {
        status:
            "NEEDS_MORE_EVIDENCE" as const,

        answer:
            "The current Lens evidence cannot establish that conclusion.",

        limitations: [
            "The blockchain transaction alone does not prove off-chain intent.",
        ],

        securityVerdictRequested:
            false,
    },

    observations: [],
};


const completedContractObservation:
    AgentObservation = {
    version:
        "bound.agent-observation.v1",

    toolId:
        "verified_contract_lookup",

    source:
        "LENS_PIPELINE",

    status:
        "COMPLETED",

    capability:
        "contract_identity",

    summary:
        "Lens checked the destination contract but did not establish a verified contract identity.",

    result: {
        address:
            "0x9Ac64Cc6e4415144C455Bd8E4837Fea55603e5c3",

        verified:
            false,

        name:
            null,

        functionSignature:
            null,

        functionConfidence:
            "unknown",

        sourcifyChecked:
            true,

        sourcifyVerified:
            false,

        signatureDatabaseChecked:
            true,

        officialProtocolAbiUsed:
            false,
    },
};


const notApplicableContractObservation:
    AgentObservation = {
    version:
        "bound.agent-observation.v1",

    toolId:
        "verified_contract_lookup",

    source:
        "LENS_PIPELINE",

    status:
        "NOT_APPLICABLE",

    capability:
        "contract_identity",

    summary:
        "Contract lookup was not applicable because the transaction has no destination address.",

    result: {
        address:
            null,

        verified:
            null,

        name:
            null,

        functionSignature:
            null,

        functionConfidence:
            null,

        sourcifyChecked:
            null,

        sourcifyVerified:
            null,

        signatureDatabaseChecked:
            null,

        officialProtocolAbiUsed:
            null,
    },
};


test(
    "registry is host-controlled and contains the existing paid tool",
    () => {
        const tools =
            listAgentTools();

        assert.equal(
            tools.length,
            3
        );

        assert.equal(
            getAgentTool(
                "transaction_analysis_paid"
            )
                ?.access,
            "PAID"
        );
    }
);


test(
    "planner context marks completed tools",
    () => {
        const context =
            buildAgentPlannerContext({
                ...baseInput,

                observations: [
                    completedContractObservation,
                ],
            });

        const contractTool =
            context
                .availableTools
                .find(
                    (
                        tool
                    ) =>
                        tool.id ===
                        "verified_contract_lookup"
                );

        assert.equal(
            contractTool
                ?.alreadyCompleted,
            true
        );
    }
);


test(
    "accepts a valid free-tool decision",
    () => {
        const result =
            parseAgentPlannerModelResponse(
                JSON.stringify({
                    decision:
                        "USE_FREE_TOOL",

                    toolId:
                        "verified_contract_lookup",

                    requiredCapability:
                        "contract_identity",

                    reason:
                        "Verified contract identity is still needed.",
                }),

                baseInput
            );

        assert.equal(
            result.decision,
            "USE_FREE_TOOL"
        );

        assert.equal(
            result.selectedTool
                ?.id,
            "verified_contract_lookup"
        );

        assert.equal(
            result.requiresAuthorization,
            false
        );
    }
);


test(
    "rejects a model-invented tool",
    () => {
        assert.throws(
            () =>
                parseAgentPlannerModelResponse(
                    JSON.stringify({
                        decision:
                            "USE_FREE_TOOL",

                        toolId:
                            "search_everything",

                        requiredCapability:
                            "contract_identity",

                        reason:
                            "Use invented tool.",
                    }),

                    baseInput
                ),

            /UNKNOWN_TOOL/
        );
    }
);


test(
    "rejects re-running a completed tool",
    () => {
        assert.throws(
            () =>
                parseAgentPlannerModelResponse(
                    JSON.stringify({
                        decision:
                            "USE_FREE_TOOL",

                        toolId:
                            "verified_contract_lookup",

                        requiredCapability:
                            "contract_identity",

                        reason:
                            "Try it again.",
                    }),

                    {
                        ...baseInput,

                        observations: [
                            completedContractObservation,
                        ],
                    }
                ),

            /SELECTED_COMPLETED_TOOL/
        );
    }
);


test(
    "rejects capability laundering from paid analysis into security verdict",
    () => {
        assert.throws(
            () =>
                parseAgentPlannerModelResponse(
                    JSON.stringify({
                        decision:
                            "REQUEST_PAID_TOOL",

                        toolId:
                            "transaction_analysis_paid",

                        requiredCapability:
                            "security_verdict",

                        reason:
                            "Use paid analysis to decide safety.",
                    }),

                    baseInput
                ),

            /CAPABILITY_MISMATCH/
        );
    }
);


test(
    "accepts no suitable tool for unsupported evidence gap",
    () => {
        const result =
            parseAgentPlannerModelResponse(
                JSON.stringify({
                    decision:
                        "NO_SUITABLE_TOOL",

                    toolId:
                        null,

                    requiredCapability:
                        "token_legitimacy",

                    reason:
                        "No registered tool proves token legitimacy.",
                }),

                baseInput
            );

        assert.equal(
            result.decision,
            "NO_SUITABLE_TOOL"
        );

        assert.equal(
            result.toolNeeded,
            false
        );

        assert.equal(
            result.requiresAuthorization,
            false
        );
    }
);


test(
    "answered Lens result short-circuits without calling a planner model",
    async () => {
        const result =
            await planAgentNextStep({
                ...baseInput,

                lensAgent: {
                    ...baseInput
                        .lensAgent,

                    status:
                        "ANSWERED",
                },
            });

        assert.equal(
            result.decision,
            "ANSWER_NOW"
        );

        assert.equal(
            result.model,
            null
        );

        assert.equal(
            result.toolNeeded,
            false
        );
    }
);


test(
    "host builds exact existing paid request only for supported chain",
    () => {
        const request =
            buildRegisteredPaidToolRequest({
                toolId:
                    "transaction_analysis_paid",

                transactionHash:
                    baseInput
                        .subject
                        .transactionHash,

                chainId:
                    97,
            });

        assert.equal(
            request.toolId,
            "bound-transaction-analysis"
        );

        assert.equal(
            request.method,
            "analyze_transaction"
        );

        assert.deepEqual(
            request.arguments,
            {
                chainId:
                    97,

                transactionHash:
                    baseInput
                        .subject
                        .transactionHash,
            }
        );
    }
);


test(
    "host refuses paid BSC tool on another chain",
    () => {
        assert.throws(
            () =>
                buildRegisteredPaidToolRequest({
                    toolId:
                        "transaction_analysis_paid",

                    transactionHash:
                        baseInput
                            .subject
                            .transactionHash,

                    chainId:
                        1,
                }),

            /UNSUPPORTED_CHAIN/
        );
    }
);


test(
    "planner context exposes Lens observations to the reasoning layer",
    () => {
        const context =
            buildAgentPlannerContext({
                ...baseInput,

                observations: [
                    completedContractObservation,
                ],
            });

        assert.equal(
            context.observations.length,
            1
        );

        assert.equal(
            context.observations[0]
                ?.toolId,
            "verified_contract_lookup"
        );

        assert.equal(
            context.observations[0]
                ?.status,
            "COMPLETED"
        );

        assert.equal(
            context.availableTools
                .find(
                    (
                        tool
                    ) =>
                        tool.id ===
                        "verified_contract_lookup"
                )
                ?.alreadyCompleted,
            true
        );
    }
);


test(
    "not-applicable observation prevents pointless tool retry",
    () => {
        assert.throws(
            () =>
                parseAgentPlannerModelResponse(
                    JSON.stringify({
                        decision:
                            "USE_FREE_TOOL",

                        toolId:
                            "verified_contract_lookup",

                        requiredCapability:
                            "contract_identity",

                        reason:
                            "Try contract lookup again.",
                    }),

                    {
                        ...baseInput,

                        observations: [
                            notApplicableContractObservation,
                        ],
                    }
                ),

            /SELECTED_COMPLETED_TOOL/
        );
    }
);
