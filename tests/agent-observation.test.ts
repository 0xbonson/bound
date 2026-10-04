import assert from "node:assert/strict";
import test from "node:test";

import type {
    ContractIntelligence,
} from "../src/chain/contract-intelligence.js";

import type {
    ProtocolIdentity,
} from "../src/chain/protocol-intelligence.js";

import {
    deriveInitialAgentObservations,
    getCompletedAgentToolIds,
    type ContractLookupObservation,
    type ProtocolLookupObservation,
} from "../src/agent/agent-observation.js";


type InitialObservations =
    ReturnType<
        typeof deriveInitialAgentObservations
    >;


function requireContractObservation(
    observations:
        InitialObservations
):
    ContractLookupObservation {
    const observation =
        observations.find(
            (
                item
            ): item is ContractLookupObservation =>
                item.toolId ===
                "verified_contract_lookup"
        );

    assert.ok(
        observation,
        "Expected verified_contract_lookup observation."
    );

    return observation;
}


function requireProtocolObservation(
    observations:
        InitialObservations
):
    ProtocolLookupObservation {
    const observation =
        observations.find(
            (
                item
            ): item is ProtocolLookupObservation =>
                item.toolId ===
                "protocol_evidence_lookup"
        );

    assert.ok(
        observation,
        "Expected protocol_evidence_lookup observation."
    );

    return observation;
}


const ROUTER =
    "0x9Ac64Cc6e4415144C455Bd8E4837Fea55603e5c3";


const verifiedContract:
    ContractIntelligence = {
    version:
        "bound.contract-intelligence.v1",

    contract: {
        address:
            ROUTER,

        chainId:
            97,

        verified:
            true,

        name:
            "PancakeSwap V2 Router",

        language:
            "Solidity",

        match:
            "exact_match",

        isProxy:
            false,

        implementations: [],
    },

    function: {
        selector:
            "0xfb3bdb41",

        name:
            "swapExactETHForTokens",

        signature:
            "swapExactETHForTokens(uint256,address[],address,uint256)",

        resolution:
            "verified_abi",

        confidence:
            "verified",

        arguments: [],

        alternativeSignatures: [],
    },

    evidence: {
        sourcifyChecked:
            true,

        sourcifyVerified:
            true,

        signatureDatabaseChecked:
            false,

        officialProtocolAbiUsed:
            false,

        officialProtocolSourceName:
            null,

        officialProtocolSourceUrl:
            null,

        aiUsedForFacts:
            false,
    },
};


const identifiedProtocol:
    ProtocolIdentity = {
    version:
        "bound.protocol-intelligence.v1",

    status:
        "identified",

    name:
        "PancakeSwap",

    category:
        "dex",

    component:
        "V2 Router",

    confidence:
        "verified",

    address:
        ROUTER,

    reason:
        "Matched an official protocol registry entry.",

    evidence: {
        method:
            "official_registry",

        sourceName:
            "PancakeSwap official repository",

        sourceUrl:
            "https://github.com/pancakeswap",

        aiUsedForFacts:
            false,
    },
};


test(
    "records verified contract evidence already resolved by Lens",
    () => {
        const observations =
            deriveInitialAgentObservations({
                contractLookupAttempted:
                    true,

                contract:
                    verifiedContract,

                protocol:
                    identifiedProtocol,
            });

        const contract =
            requireContractObservation(
                observations
            );

        assert.equal(
            contract.toolId,
            "verified_contract_lookup"
        );

        assert.equal(
            contract.status,
            "COMPLETED"
        );

        assert.equal(
            contract.result.verified,
            true
        );

        assert.equal(
            contract.result.name,
            "PancakeSwap V2 Router"
        );
    }
);


test(
    "records protocol evidence already resolved by Lens",
    () => {
        const observations =
            deriveInitialAgentObservations({
                contractLookupAttempted:
                    true,

                contract:
                    verifiedContract,

                protocol:
                    identifiedProtocol,
            });

        const protocol =
            requireProtocolObservation(
                observations
            );

        assert.equal(
            protocol.toolId,
            "protocol_evidence_lookup"
        );

        assert.equal(
            protocol.status,
            "COMPLETED"
        );

        assert.equal(
            protocol.result.status,
            "identified"
        );

        assert.equal(
            protocol.result.name,
            "PancakeSwap"
        );
    }
);


test(
    "unverified contract lookup is still a completed observation",
    () => {
        const observations =
            deriveInitialAgentObservations({
                contractLookupAttempted:
                    true,

                contract: {
                    ...verifiedContract,

                    contract: {
                        ...verifiedContract.contract,

                        verified:
                            false,

                        name:
                            null,

                        match:
                            null,
                    },

                    evidence: {
                        ...verifiedContract.evidence,

                        sourcifyVerified:
                            false,

                        signatureDatabaseChecked:
                            true,
                    },
                },

                protocol:
                    identifiedProtocol,
            });

        const contract =
            requireContractObservation(
                observations
            );

        assert.equal(
            contract.status,
            "COMPLETED"
        );

        assert.equal(
            contract.result.verified,
            false
        );

        assert.equal(
            contract.result.sourcifyChecked,
            true
        );
    }
);


test(
    "contract lookup without destination is terminally not applicable",
    () => {
        const observations =
            deriveInitialAgentObservations({
                contractLookupAttempted:
                    false,

                contract:
                    null,

                protocol:
                    identifiedProtocol,
            });

        const contract =
            requireContractObservation(
                observations
            );

        assert.equal(
            contract.status,
            "NOT_APPLICABLE"
        );

        assert.equal(
            contract.result.address,
            null
        );
    }
);


test(
    "none identified protocol is preserved rather than retried",
    () => {
        const observations =
            deriveInitialAgentObservations({
                contractLookupAttempted:
                    true,

                contract:
                    verifiedContract,

                protocol: {
                    ...identifiedProtocol,

                    status:
                        "none_identified",

                    name:
                        null,

                    category:
                        null,

                    component:
                        null,

                    confidence:
                        "evidence_based",

                    evidence: {
                        ...identifiedProtocol.evidence,

                        method:
                            "direct_token_call",

                        sourceName:
                            null,

                        sourceUrl:
                            null,
                    },
                },
            });

        const protocol =
            requireProtocolObservation(
                observations
            );

        assert.equal(
            protocol.status,
            "COMPLETED"
        );

        assert.equal(
            protocol.result.status,
            "none_identified"
        );
    }
);


test(
    "completed tool ids are derived from observations without duplicates",
    () => {
        const observations =
            deriveInitialAgentObservations({
                contractLookupAttempted:
                    true,

                contract:
                    verifiedContract,

                protocol:
                    identifiedProtocol,
            });

        const ids =
            getCompletedAgentToolIds([
                ...observations,
                observations[0]!,
            ]);

        assert.deepEqual(
            ids,
            [
                "verified_contract_lookup",
                "protocol_evidence_lookup",
            ]
        );
    }
);
