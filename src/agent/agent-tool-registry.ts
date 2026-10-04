import {
    buildTransactionAnalysisToolRequest,
} from "../core/intent-manifest.js";

import {
    type ToolRequest,
} from "../core/request-bound.js";


export const AGENT_TOOL_REGISTRY_VERSION =
    "bound.agent-tool-registry.v1" as const;


export const AGENT_TOOL_CAPABILITIES = [
    "contract_identity",
    "protocol_identity",
    "recipient_bytecode",
    "paid_transaction_analysis",
    "security_verdict",
    "token_legitimacy",
    "market_value",
    "ownership_proof",
    "offchain_intent",
    "other",
] as const;


export type AgentToolCapability =
    typeof AGENT_TOOL_CAPABILITIES[number];


export const AGENT_TOOL_IDS = [
    "verified_contract_lookup",
    "protocol_evidence_lookup",
    "recipient_code_lookup",
    "transaction_analysis_paid",
] as const;


export type AgentToolId =
    typeof AGENT_TOOL_IDS[number];


export type AgentToolAccess =
    | "FREE"
    | "PAID";


export type AgentToolDefinition = {
    id:
        AgentToolId;

    name:
        string;

    access:
        AgentToolAccess;

    description:
        string;

    capabilities:
        readonly AgentToolCapability[];

    execution:
        | "FREE_HOST"
        | "GUARDED_PAID";

    supportedChainIds:
        | "ANY_EVM"
        | readonly number[];
};


/*
 * Only the host defines tools.
 *
 * The model may select one of these IDs,
 * but it cannot create a new tool or alter
 * the access class of an existing tool.
 */
const AGENT_TOOL_REGISTRY:
    readonly AgentToolDefinition[] = [
        {
            id:
                "verified_contract_lookup",

            name:
                "Verified Contract Lookup",

            access:
                "FREE",

            description:
                "Resolve verified contract identity and ABI evidence using BOUND's existing contract-intelligence pipeline.",

            capabilities: [
                "contract_identity",
            ],

            execution:
                "FREE_HOST",

            supportedChainIds:
                "ANY_EVM",
        },

        {
            id:
                "protocol_evidence_lookup",

            name:
                "Protocol Evidence Lookup",

            access:
                "FREE",

            description:
                "Resolve protocol identity from BOUND's host-controlled protocol evidence pipeline.",

            capabilities: [
                "protocol_identity",
            ],

            execution:
                "FREE_HOST",

            supportedChainIds:
                "ANY_EVM",
        },

        {
            id:
                "recipient_code_lookup",

            name:
                "Recipient Code Lookup",

            access:
                "FREE",

            description:
                "Check whether the transaction recipient currently has deployed EVM bytecode.",

            capabilities: [
                "recipient_bytecode",
            ],

            execution:
                "FREE_HOST",

            supportedChainIds:
                "ANY_EVM",
        },

        {
            id:
                "transaction_analysis_paid",

            name:
                "Paid Transaction Analysis",

            access:
                "PAID",

            description:
                "Existing request-bound paid transaction-analysis tool protected by BOUND Guard.",

            capabilities: [
                "paid_transaction_analysis",
            ],

            execution:
                "GUARDED_PAID",

            supportedChainIds: [
                97,
            ],
        },
    ];


export function listAgentTools():
    readonly AgentToolDefinition[] {
    return AGENT_TOOL_REGISTRY;
}


export function getAgentTool(
    id:
        string
):
    AgentToolDefinition |
    null {
    return (
        AGENT_TOOL_REGISTRY
            .find(
                (
                    tool
                ) =>
                    tool.id ===
                    id
            ) ??
        null
    );
}


export function agentToolSupportsChain(
    tool:
        AgentToolDefinition,

    chainId:
        number
):
    boolean {
    if (
        tool.supportedChainIds ===
        "ANY_EVM"
    ) {
        return true;
    }

    return tool
        .supportedChainIds
        .some(
            (
                supportedChainId
            ) =>
                supportedChainId ===
                chainId
        );
}


/*
 * Paid request construction remains host-side.
 *
 * The planner chooses only a registered tool ID.
 * It never constructs or mutates the semantic
 * ToolRequest that BOUND Guard later authorizes.
 */
export function buildRegisteredPaidToolRequest(
    input: {
        toolId:
            AgentToolId;

        transactionHash:
            string;

        chainId:
            number;
    }
):
    ToolRequest {
    const tool =
        getAgentTool(
            input.toolId
        );

    if (
        !tool
    ) {
        throw new Error(
            `UNKNOWN_AGENT_TOOL:${input.toolId}`
        );
    }

    if (
        tool.access !==
        "PAID"
    ) {
        throw new Error(
            `AGENT_TOOL_IS_NOT_PAID:${input.toolId}`
        );
    }

    if (
        !agentToolSupportsChain(
            tool,
            input.chainId
        )
    ) {
        throw new Error(
            `AGENT_TOOL_UNSUPPORTED_CHAIN:${input.toolId}:${input.chainId}`
        );
    }

    switch (
        tool.id
    ) {
        case "transaction_analysis_paid":
            return buildTransactionAnalysisToolRequest(
                input.transactionHash
            );

        default:
            throw new Error(
                `PAID_AGENT_TOOL_HAS_NO_REQUEST_BUILDER:${tool.id}`
            );
    }
}
