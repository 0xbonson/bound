import {
    createPublicClient,
    http,
    type Address,
    type Hex,
} from "viem";

import {
    getEvmNetworkByChainId,
} from "../chain/evm-network-registry.js";

import {
    getNetworkRpcUrl,
    NETWORK_CHAINS,
} from "../chain/transaction-network-discovery.js";

import type {
    UniversalTransactionFacts,
} from "../chain/universal-transaction-intelligence.js";

import {
    agentToolSupportsChain,
    getAgentTool,
    type AgentToolId,
} from "./agent-tool-registry.js";

import type {
    AgentObservation,
    RecipientCodeObservation,
} from "./agent-observation.js";


export const AGENT_TOOL_EXECUTOR_VERSION =
    "bound.agent-tool-executor.v1" as const;


type GetBytecodeLike =
    (
        input: {
            chainId:
                number;

            address:
                Address;
        }
    ) => Promise<
        Hex |
        undefined
    >;


async function defaultGetBytecode(
    input: {
        chainId:
            number;

        address:
            Address;
    }
):
    Promise<
        Hex |
        undefined
    > {
    const network =
        getEvmNetworkByChainId(
            input.chainId
        );

    if (
        !network
    ) {
        throw new Error(
            `AGENT_TOOL_UNKNOWN_NETWORK:${input.chainId}`
        );
    }

    const chain =
        NETWORK_CHAINS[
            network.id
        ];

    const rpcUrl =
        getNetworkRpcUrl(
            network
        );

    const client =
        createPublicClient({
            chain,

            transport:
                http(
                    rpcUrl
                ),
        });

    return client.getBytecode({
        address:
            input.address,
    });
}


async function executeRecipientCodeLookup(
    facts:
        UniversalTransactionFacts,

    getBytecode:
        GetBytecodeLike
):
    Promise<
        RecipientCodeObservation
    > {
    const recipient =
        facts.transaction.to;

    if (
        !recipient
    ) {
        return {
            version:
                "bound.agent-observation.v1",

            toolId:
                "recipient_code_lookup",

            source:
                "RUNTIME_TOOL",

            status:
                "NOT_APPLICABLE",

            capability:
                "recipient_bytecode",

            summary:
                "Recipient bytecode lookup was not applicable because the transaction has no destination address.",

            result: {
                address:
                    null,

                hasDeployedBytecode:
                    null,
            },
        };
    }

    const bytecode =
        await getBytecode({
            chainId:
                facts.subject.chainId,

            address:
                recipient,
        });

    const hasDeployedBytecode =
        Boolean(
            bytecode &&
            bytecode !==
                "0x"
        );

    return {
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
            hasDeployedBytecode
                ? "The transaction recipient currently has deployed EVM bytecode."
                : "The transaction recipient currently has no deployed EVM bytecode.",

        result: {
            address:
                recipient,

            hasDeployedBytecode,
        },
    };
}


export async function executeFreeAgentTool(
    input: {
        toolId:
            AgentToolId;

        facts:
            UniversalTransactionFacts;
    },

    options?: {
        getBytecode?:
            GetBytecodeLike;
    }
):
    Promise<
        AgentObservation
    > {
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
        "FREE"
    ) {
        throw new Error(
            `AGENT_TOOL_IS_NOT_FREE:${input.toolId}`
        );
    }

    if (
        !agentToolSupportsChain(
            tool,
            input.facts.subject.chainId
        )
    ) {
        throw new Error(
            `AGENT_TOOL_UNSUPPORTED_CHAIN:${input.toolId}:${input.facts.subject.chainId}`
        );
    }

    switch (
        tool.id
    ) {
        case "recipient_code_lookup":
            return executeRecipientCodeLookup(
                input.facts,
                options?.getBytecode ??
                    defaultGetBytecode
            );

        case "verified_contract_lookup":
        case "protocol_evidence_lookup":
            throw new Error(
                `AGENT_FREE_TOOL_OWNED_BY_LENS_PIPELINE:${tool.id}`
            );

        default:
            throw new Error(
                `AGENT_FREE_TOOL_HAS_NO_EXECUTOR:${tool.id}`
            );
    }
}
