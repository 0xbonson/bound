import type {
    UniversalTransactionFacts,
} from "../chain/universal-transaction-intelligence.js";

import type {
    TransactionInterpretation,
} from "../chain/transaction-interpretation.js";

import type {
    ToolRequest,
} from "../core/request-bound.js";

import {
    askLensAgent,
    type LensAgentResult,
} from "./lens-agent.js";

import {
    planAgentNextStep,
    type AgentPlannerResult,
} from "./agent-planner.js";

import {
    executeFreeAgentTool,
} from "./agent-tool-executor.js";

import {
    buildRegisteredPaidToolRequest,
    type AgentToolId,
} from "./agent-tool-registry.js";

import {
    getCompletedAgentToolIds,
    type AgentObservation,
} from "./agent-observation.js";


export const AGENT_RUNTIME_VERSION =
    "bound.agent-runtime.v1" as const;


export const AGENT_RUNTIME_MAX_STEPS =
    4 as const;


export type AgentRuntimeStatus =
    | "ANSWERED"
    | "NEEDS_MORE_EVIDENCE"
    | "PAUSED_FOR_AUTHORIZATION"
    | "MAX_STEPS_REACHED";


export type AgentRuntimeActivity = {
    step:
        number;

    phase:
        | "REASON"
        | "PLAN"
        | "ACT"
        | "OBSERVE"
        | "PAUSE"
        | "STOP";

    message:
        string;

    toolId?:
        AgentToolId;
};


export type AgentRuntimeResult = {
    version:
        typeof AGENT_RUNTIME_VERSION;

    status:
        AgentRuntimeStatus;

    goal:
        string;

    lensAgent:
        LensAgentResult;

    planner:
        AgentPlannerResult |
        null;

    observations:
        AgentObservation[];

    paidRequest:
        ToolRequest |
        null;

    activity:
        AgentRuntimeActivity[];

    steps:
        number;

    maxSteps:
        typeof AGENT_RUNTIME_MAX_STEPS;

    autoPayment:
        false;
};


export type AgentRuntimeDependencies = {
    ask:
        typeof askLensAgent;

    plan:
        typeof planAgentNextStep;

    executeFree:
        (
            input:
                Parameters<
                    typeof executeFreeAgentTool
                >[0]
        ) => Promise<
            AgentObservation
        >;

    buildPaidRequest:
        typeof buildRegisteredPaidToolRequest;
};


const DEFAULT_DEPENDENCIES:
    AgentRuntimeDependencies = {
        ask:
            askLensAgent,

        plan:
            planAgentNextStep,

        executeFree:
            executeFreeAgentTool,

        buildPaidRequest:
            buildRegisteredPaidToolRequest,
    };


function plannerInputFromLens(
    input: {
        goal:
            string;

        facts:
            UniversalTransactionFacts;

        lensAgent:
            LensAgentResult;

        observations:
            readonly AgentObservation[];
    }
) {
    return {
        goal:
            input.goal,

        subject: {
            transactionHash:
                input.facts
                    .subject
                    .transactionHash,

            chainId:
                input.facts
                    .subject
                    .chainId,

            network:
                input.facts
                    .subject
                    .network,
        },

        lensAgent: {
            status:
                input.lensAgent
                    .status,

            answer:
                input.lensAgent
                    .answer,

            limitations:
                input.lensAgent
                    .limitations,

            securityVerdictRequested:
                input.lensAgent
                    .securityVerdictRequested,
        },

        observations:
            input.observations,
    };
}


export async function runAgentRuntime(
    input: {
        goal:
            string;

        facts:
            UniversalTransactionFacts;

        interpretation:
            TransactionInterpretation;

        observations:
            readonly AgentObservation[];
    },

    dependencies:
        AgentRuntimeDependencies =
            DEFAULT_DEPENDENCIES
):
    Promise<
        AgentRuntimeResult
    > {
    const observations:
        AgentObservation[] = [
            ...input.observations,
        ];

    const activity:
        AgentRuntimeActivity[] = [];

    let planner:
        AgentPlannerResult |
        null =
            null;

    let lensAgent =
        await dependencies.ask({
            question:
                input.goal,

            facts:
                input.facts,

            interpretation:
                input.interpretation,

            observations,
        });

    activity.push({
        step:
            0,

        phase:
            "REASON",

        message:
            `Lens Agent reasoned over ${observations.length} host-controlled observations.`,
    });

    if (
        lensAgent.status ===
        "ANSWERED"
    ) {
        activity.push({
            step:
                0,

            phase:
                "STOP",

            message:
                "The grounded evidence already answers the goal.",
        });

        return {
            version:
                AGENT_RUNTIME_VERSION,

            status:
                "ANSWERED",

            goal:
                input.goal,

            lensAgent,

            planner:
                null,

            observations,

            paidRequest:
                null,

            activity,

            steps:
                0,

            maxSteps:
                AGENT_RUNTIME_MAX_STEPS,

            autoPayment:
                false,
        };
    }

    for (
        let step = 1;
        step <=
        AGENT_RUNTIME_MAX_STEPS;
        step += 1
    ) {
        planner =
            await dependencies.plan(
                plannerInputFromLens({
                    goal:
                        input.goal,

                    facts:
                        input.facts,

                    lensAgent,

                    observations,
                })
            );

        activity.push({
            step,

            phase:
                "PLAN",

            message:
                `Planner selected ${planner.decision}.`,

            ...(planner.selectedTool
                ? {
                    toolId:
                        planner
                            .selectedTool
                            .id,
                }
                : {}),
        });

        if (
            planner.decision ===
            "ANSWER_NOW"
        ) {
            /*
             * Planner is only invoked while Lens still needs
             * more evidence. An ANSWER_NOW decision here would
             * violate the runtime/planner contract.
             */
            throw new Error(
                "AGENT_RUNTIME_PLANNER_ANSWER_WITH_UNRESOLVED_EVIDENCE"
            );
        }

        if (
            planner.decision ===
            "NO_SUITABLE_TOOL"
        ) {
            activity.push({
                step,

                phase:
                    "STOP",

                message:
                    "No registered applicable tool can provide the missing evidence.",
            });

            return {
                version:
                    AGENT_RUNTIME_VERSION,

                status:
                    "NEEDS_MORE_EVIDENCE",

                goal:
                    input.goal,

                lensAgent,

                planner,

                observations,

                paidRequest:
                    null,

                activity,

                steps:
                    step,

                maxSteps:
                    AGENT_RUNTIME_MAX_STEPS,

                autoPayment:
                    false,
            };
        }

        if (
            planner.decision ===
            "REQUEST_PAID_TOOL"
        ) {
            const tool =
                planner.selectedTool;

            if (
                !tool
            ) {
                throw new Error(
                    "AGENT_RUNTIME_PAID_DECISION_WITHOUT_TOOL"
                );
            }

            /*
             * Paid capabilities are also single-use within
             * one evidence state.
             *
             * A completed paid observation must never cause
             * the Agent to purchase the same capability
             * again just because the model still asks for it.
             */
            const completed =
                new Set(
                    getCompletedAgentToolIds(
                        observations
                    )
                );


            if (
                completed.has(
                    tool.id
                )
            ) {
                throw new Error(
                    `AGENT_RUNTIME_REFUSED_REPEATED_TOOL:${tool.id}`
                );
            }


            const request =
                dependencies
                    .buildPaidRequest({
                        toolId:
                            tool.id,

                        transactionHash:
                            input
                                .facts
                                .subject
                                .transactionHash,

                        chainId:
                            input
                                .facts
                                .subject
                                .chainId,
                    });

            activity.push({
                step,

                phase:
                    "PAUSE",

                toolId:
                    tool.id,

                message:
                    "A paid tool is required. Runtime paused before authorization or payment.",
            });

            return {
                version:
                    AGENT_RUNTIME_VERSION,

                status:
                    "PAUSED_FOR_AUTHORIZATION",

                goal:
                    input.goal,

                lensAgent,

                planner,

                observations,

                paidRequest:
                    request,

                activity,

                steps:
                    step,

                maxSteps:
                    AGENT_RUNTIME_MAX_STEPS,

                autoPayment:
                    false,
            };
        }

        const tool =
            planner.selectedTool;

        if (
            !tool
        ) {
            throw new Error(
                "AGENT_RUNTIME_FREE_DECISION_WITHOUT_TOOL"
            );
        }

        const completed =
            new Set(
                getCompletedAgentToolIds(
                    observations
                )
            );

        if (
            completed.has(
                tool.id
            )
        ) {
            throw new Error(
                `AGENT_RUNTIME_REFUSED_REPEATED_TOOL:${tool.id}`
            );
        }

        activity.push({
            step,

            phase:
                "ACT",

            toolId:
                tool.id,

            message:
                `Executing registered free tool ${tool.id}.`,
        });

        const observation =
            await dependencies
                .executeFree({
                    toolId:
                        tool.id,

                    facts:
                        input.facts,
                });

        if (
            observation.toolId !==
            tool.id
        ) {
            throw new Error(
                `AGENT_RUNTIME_OBSERVATION_TOOL_MISMATCH:${tool.id}:${observation.toolId}`
            );
        }

        observations.push(
            observation
        );

        activity.push({
            step,

            phase:
                "OBSERVE",

            toolId:
                tool.id,

            message:
                observation.summary,
        });

        /*
         * Reason again after observing the tool result.
         *
         * This is the critical difference between a one-shot
         * tool call and an agent loop.
         */
        lensAgent =
            await dependencies.ask({
                question:
                    input.goal,

                facts:
                    input.facts,

                interpretation:
                    input.interpretation,

                observations,
            });

        activity.push({
            step,

            phase:
                "REASON",

            toolId:
                tool.id,

            message:
                "Lens Agent reasoned again using the new host-controlled observation.",
        });

        if (
            lensAgent.status ===
            "ANSWERED"
        ) {
            activity.push({
                step,

                phase:
                    "STOP",

                message:
                    "The new observation resolved the evidence gap.",
            });

            return {
                version:
                    AGENT_RUNTIME_VERSION,

                status:
                    "ANSWERED",

                goal:
                    input.goal,

                lensAgent,

                planner,

                observations,

                paidRequest:
                    null,

                activity,

                steps:
                    step,

                maxSteps:
                    AGENT_RUNTIME_MAX_STEPS,

                autoPayment:
                    false,
            };
        }
    }

    activity.push({
        step:
            AGENT_RUNTIME_MAX_STEPS,

        phase:
            "STOP",

        message:
            "The bounded Agent Runtime reached its maximum number of autonomous steps.",
    });

    return {
        version:
            AGENT_RUNTIME_VERSION,

        status:
            "MAX_STEPS_REACHED",

        goal:
            input.goal,

        lensAgent,

        planner,

        observations,

        paidRequest:
            null,

        activity,

        steps:
            AGENT_RUNTIME_MAX_STEPS,

        maxSteps:
            AGENT_RUNTIME_MAX_STEPS,

        autoPayment:
            false,
    };
}
