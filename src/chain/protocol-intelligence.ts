import {
  type Address,
} from "viem";

import type {
  UniversalTransactionFacts,
} from "./universal-transaction-intelligence.js";

import type {
  ContractIntelligence,
} from "./contract-intelligence.js";

export const PROTOCOL_INTELLIGENCE_VERSION =
  "bound.protocol-intelligence.v1" as const;

export type ProtocolCategory =
  | "dex"
  | "bridge"
  | "lending"
  | "staking"
  | "payments"
  | "other";

export type ProtocolIdentity = {
  version:
    typeof PROTOCOL_INTELLIGENCE_VERSION;

  status:
    | "identified"
    | "none_identified"
    | "unknown";

  name:
    string |
    null;

  category:
    ProtocolCategory |
    null;

  component:
    string |
    null;

  confidence:
    | "verified"
    | "evidence_based"
    | "unknown";

  address:
    Address |
    null;

  reason:
    string;

  evidence: {
    method:
      | "official_registry"
      | "direct_token_call"
      | "transaction_shape"
      | "none";

    sourceName:
      string |
      null;

    sourceUrl:
      string |
      null;

    aiUsedForFacts:
      false;
  };
};

type ProtocolRegistryEntry = {
  chainId:
    number;

  address:
    Address;

  name:
    string;

  category:
    ProtocolCategory;

  component:
    string;

  sourceName:
    string;

  sourceUrl:
    string;
};

/*
 * High-confidence protocol mappings only.
 *
 * Every entry must come from an official project
 * source. Do not add addresses from random labels,
 * search snippets, or AI inference.
 */
const OFFICIAL_PROTOCOL_REGISTRY:
  ProtocolRegistryEntry[] = [
    {
      chainId:
        97,

      address:
        "0x9Ac64Cc6e4415144C455Bd8E4837Fea55603e5c3",

      name:
        "PancakeSwap",

      category:
        "dex",

      component:
        "V2 Router",

      sourceName:
        "PancakeSwap official repository",

      sourceUrl:
        "https://" +
        "github.com/pancakeswap/pancakeswap-ai/blob/main/packages/plugins/pancakeswap-driver/skills/swap-integration/SKILL.md",
    },
  ];

function sameAddress(
  left:
    Address,

  right:
    Address
): boolean {
  return (
    left.toLowerCase() ===
    right.toLowerCase()
  );
}

export function resolveProtocolIdentity(
  facts:
    UniversalTransactionFacts,

  contract:
    ContractIntelligence |
    null
): ProtocolIdentity {
  /*
   * A plain native transfer does not directly call
   * a dApp function.
   */
  if (
    facts.action.type ===
    "native_transfer"
  ) {
    return {
      version:
        PROTOCOL_INTELLIGENCE_VERSION,

      status:
        "none_identified",

      name:
        null,

      category:
        null,

      component:
        null,

      confidence:
        "verified",

      address:
        facts.transaction.to,

      reason:
        "This transaction is a direct native-asset transfer with no function calldata.",

      evidence: {
        method:
          "transaction_shape",

        sourceName:
          null,

        sourceUrl:
          null,

        aiUsedForFacts:
          false,
      },
    };
  }

  /*
   * Direct ERC-20/BEP-20 methods tell us about the
   * token contract call itself. They do not prove
   * that a DEX, bridge, or lending app was used.
   */
  if (
    facts.action.type ===
      "erc20_transfer" ||
    facts.action.type ===
      "erc20_approve" ||
    facts.action.type ===
      "erc20_transfer_from"
  ) {
    return {
      version:
        PROTOCOL_INTELLIGENCE_VERSION,

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

      address:
        facts.transaction.to,

      reason:
        "The top-level transaction directly called a token contract. No intermediary protocol contract was identified.",

      evidence: {
        method:
          "direct_token_call",

        sourceName:
          null,

        sourceUrl:
          null,

        aiUsedForFacts:
          false,
      },
    };
  }

  if (
    facts.action.type ===
    "contract_creation"
  ) {
    return {
      version:
        PROTOCOL_INTELLIGENCE_VERSION,

      status:
        "none_identified",

      name:
        null,

      category:
        null,

      component:
        null,

      confidence:
        "verified",

      address:
        null,

      reason:
        "The transaction created a contract rather than calling an existing protocol contract.",

      evidence: {
        method:
          "transaction_shape",

        sourceName:
          null,

        sourceUrl:
          null,

        aiUsedForFacts:
          false,
      },
    };
  }

  const destination =
    facts.transaction.to;

  if (
    destination
  ) {
    const official =
      OFFICIAL_PROTOCOL_REGISTRY.find(
        (
          entry
        ) =>
          entry.chainId ===
            facts.subject.chainId &&
          sameAddress(
            entry.address,
            destination
          )
      );

    if (
      official
    ) {
      return {
        version:
          PROTOCOL_INTELLIGENCE_VERSION,

        status:
          "identified",

        name:
          official.name,

        category:
          official.category,

        component:
          official.component,

        confidence:
          "verified",

        address:
          destination,

        reason:
          `${official.name} identifies this address as its ${official.component} on this network.`,

        evidence: {
          method:
            "official_registry",

          sourceName:
            official.sourceName,

          sourceUrl:
            official.sourceUrl,

          aiUsedForFacts:
            false,
        },
      };
    }
  }

  if (
    contract
      ?.contract
      .name
  ) {
    return {
      version:
        PROTOCOL_INTELLIGENCE_VERSION,

      status:
        "unknown",

      name:
        null,

      category:
        null,

      component:
        contract
          .contract
          .name,

      confidence:
        "unknown",

      address:
        destination,

      reason:
        `The verified contract is named ${contract.contract.name}, but a contract name alone is not reliable evidence of protocol ownership.`,

      evidence: {
        method:
          "none",

        sourceName:
          null,

        sourceUrl:
          null,

        aiUsedForFacts:
          false,
      },
    };
  }

  return {
    version:
      PROTOCOL_INTELLIGENCE_VERSION,

    status:
      "unknown",

    name:
      null,

    category:
      null,

    component:
      null,

    confidence:
      "unknown",

    address:
      destination,

    reason:
      "BOUND has not found reliable evidence linking this destination address to a known protocol or dApp.",

    evidence: {
      method:
        "none",

      sourceName:
        null,

      sourceUrl:
        null,

      aiUsedForFacts:
        false,
    },
  };
}
