import type {
    ContractIntelligence,
} from "../chain/contract-intelligence.js";

import type {
    ProtocolIdentity,
} from "../chain/protocol-intelligence.js";

import type {
    AgentToolId,
} from "./agent-tool-registry.js";


export const AGENT_OBSERVATION_VERSION =
    "bound.agent-observation.v1" as const;


export type AgentObservationStatus =
    | "COMPLETED"
    | "NOT_APPLICABLE";


export type ContractLookupObservation = {
    version:
        typeof AGENT_OBSERVATION_VERSION;

    toolId:
        "verified_contract_lookup";

    source:
        "LENS_PIPELINE";

    status:
        AgentObservationStatus;

    capability:
        "contract_identity";

    summary:
        string;

    result: {
        address:
            string |
            null;

        verified:
            boolean |
            null;

        name:
            string |
            null;

        functionSignature:
            string |
            null;

        functionConfidence:
            string |
            null;

        sourcifyChecked:
            boolean |
            null;

        sourcifyVerified:
            boolean |
            null;

        signatureDatabaseChecked:
            boolean |
            null;

        officialProtocolAbiUsed:
            boolean |
            null;
    };
};


export type ProtocolLookupObservation = {
    version:
        typeof AGENT_OBSERVATION_VERSION;

    toolId:
        "protocol_evidence_lookup";

    source:
        "LENS_PIPELINE";

    status:
        "COMPLETED";

    capability:
        "protocol_identity";

    summary:
        string;

    result: {
        status:
            ProtocolIdentity["status"];

        name:
            string |
            null;

        category:
            ProtocolIdentity["category"];

        component:
            string |
            null;

        confidence:
            ProtocolIdentity["confidence"];

        address:
            string |
            null;

        evidenceMethod:
            ProtocolIdentity["evidence"]["method"];

        sourceName:
            string |
            null;

        sourceUrl:
            string |
            null;
    };
};


export type RecipientCodeObservation = {
    version:
        typeof AGENT_OBSERVATION_VERSION;

    toolId:
        "recipient_code_lookup";

    source:
        "RUNTIME_TOOL";

    status:
        AgentObservationStatus;

    capability:
        "recipient_bytecode";

    summary:
        string;

    result: {
        address:
            string |
            null;

        hasDeployedBytecode:
            boolean |
            null;
    };
};


export type PaidTransactionAnalysisObservation = {
    version:
        typeof AGENT_OBSERVATION_VERSION;

    toolId:
        "transaction_analysis_paid";

    source:
        "MPP_PAID_TOOL";

    status:
        "COMPLETED";

    capability:
        "paid_transaction_analysis";

    summary:
        string;

    result: {
        source:
            string |
            null;

        network:
            string |
            null;

        chainId:
            number |
            null;

        blockNumber:
            string |
            null;

        checkedTransaction:
            unknown;

        rpcResult:
            unknown;
    };
};


export type AgentObservation =
    | ContractLookupObservation
    | ProtocolLookupObservation
    | RecipientCodeObservation
    | PaidTransactionAnalysisObservation;


function buildContractObservation(
    input: {
        lookupAttempted:
            boolean;

        contract:
            ContractIntelligence |
            null;
    }
):
    ContractLookupObservation {
    if (
        !input.lookupAttempted
    ) {
        return {
            version:
                AGENT_OBSERVATION_VERSION,

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
    }

    if (
        !input.contract
    ) {
        return {
            version:
                AGENT_OBSERVATION_VERSION,

            toolId:
                "verified_contract_lookup",

            source:
                "LENS_PIPELINE",

            status:
                "COMPLETED",

            capability:
                "contract_identity",

            summary:
                "Contract lookup completed without usable contract-intelligence output.",

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
    }

    const contract =
        input.contract;

    return {
        version:
            AGENT_OBSERVATION_VERSION,

        toolId:
            "verified_contract_lookup",

        source:
            "LENS_PIPELINE",

        status:
            "COMPLETED",

        capability:
            "contract_identity",

        summary:
            contract.contract.verified
                ? (
                    contract.contract.name
                        ? `Lens resolved a verified destination contract as ${contract.contract.name}.`
                        : "Lens resolved the destination as a verified contract."
                )
                : "Lens checked the destination contract but did not establish a verified contract identity.",

        result: {
            address:
                contract.contract.address,

            verified:
                contract.contract.verified,

            name:
                contract.contract.name,

            functionSignature:
                contract.function.signature,

            functionConfidence:
                contract.function.confidence,

            sourcifyChecked:
                contract.evidence.sourcifyChecked,

            sourcifyVerified:
                contract.evidence.sourcifyVerified,

            signatureDatabaseChecked:
                contract.evidence.signatureDatabaseChecked,

            officialProtocolAbiUsed:
                contract.evidence
                    .officialProtocolAbiUsed ??
                false,
        },
    };
}


function buildProtocolObservation(
    protocol:
        ProtocolIdentity
):
    ProtocolLookupObservation {
    let summary:
        string;

    if (
        protocol.status ===
        "identified"
    ) {
        summary =
            protocol.name
                ? `Lens identified the protocol as ${protocol.name}.`
                : "Lens identified protocol evidence.";
    } else if (
        protocol.status ===
        "none_identified"
    ) {
        summary =
            "Lens completed protocol resolution and did not identify an intermediary protocol.";
    } else {
        summary =
            "Lens completed protocol resolution but the protocol identity remains unknown.";
    }

    return {
        version:
            AGENT_OBSERVATION_VERSION,

        toolId:
            "protocol_evidence_lookup",

        source:
            "LENS_PIPELINE",

        status:
            "COMPLETED",

        capability:
            "protocol_identity",

        summary,

        result: {
            status:
                protocol.status,

            name:
                protocol.name,

            category:
                protocol.category,

            component:
                protocol.component,

            confidence:
                protocol.confidence,

            address:
                protocol.address,

            evidenceMethod:
                protocol.evidence.method,

            sourceName:
                protocol.evidence.sourceName,

            sourceUrl:
                protocol.evidence.sourceUrl,
        },
    };
}


export function deriveInitialAgentObservations(
    input: {
        contractLookupAttempted:
            boolean;

        contract:
            ContractIntelligence |
            null;

        protocol:
            ProtocolIdentity;
    }
):
    AgentObservation[] {
    return [
        buildContractObservation({
            lookupAttempted:
                input.contractLookupAttempted,

            contract:
                input.contract,
        }),

        buildProtocolObservation(
            input.protocol
        ),
    ];
}


export function buildPaidTransactionAnalysisObservation(
    input: {
        source?:
            string;

        network?:
            string;

        chainId?:
            number;

        blockNumber?:
            string;

        checkedTransaction?:
            unknown;

        rpcResult?:
            unknown;
    }
):
    PaidTransactionAnalysisObservation {
    return {
        version:
            AGENT_OBSERVATION_VERSION,

        toolId:
            "transaction_analysis_paid",

        source:
            "MPP_PAID_TOOL",

        status:
            "COMPLETED",

        capability:
            "paid_transaction_analysis",

        summary:
            [
                "Paid transaction analysis completed through the MPP-protected provider.",
                input.network
                    ? `Network: ${input.network}.`
                    : "",
                input.blockNumber
                    ? `Block: ${input.blockNumber}.`
                    : "",
                "The returned RPC evidence is now available to the Agent.",
            ]
                .filter(Boolean)
                .join(" "),

        result: {
            source:
                input.source ??
                null,

            network:
                input.network ??
                null,

            chainId:
                input.chainId ??
                null,

            blockNumber:
                input.blockNumber ??
                null,

            checkedTransaction:
                input.checkedTransaction ??
                null,

            rpcResult:
                input.rpcResult ??
                null,
        },
    };
}


export function getCompletedAgentToolIds(
    observations:
        readonly AgentObservation[]
):
    AgentToolId[] {
    return [
        ...new Set(
            observations.map(
                (
                    observation
                ) =>
                    observation.toolId
            )
        ),
    ];
}
