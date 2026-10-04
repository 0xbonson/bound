import {
  formatUnits,
  type Address,
} from "viem";

import type {
  UniversalTransactionFacts,
} from "./universal-transaction-intelligence.js";

import type {
  ContractIntelligence,
} from "./contract-intelligence.js";

import {
  resolveProtocolIdentity,
  type ProtocolIdentity,
} from "./protocol-intelligence.js";

import {
  resolveSwapIntelligence,
  type SwapIntelligence,
} from "./swap-intelligence.js";

import {
  refineContractWithOfficialProtocolAbi,
} from "./official-protocol-function.js";

export const TRANSACTION_INTERPRETATION_VERSION =
  "bound.transaction-interpretation.v1" as const;

export type ObservedTokenEffect = {
  token:
    Address;

  symbol:
    string |
    null;

  decimals:
    number |
    null;

  direction:
    "in" |
    "out";

  amountRaw:
    string;

  amountFormatted:
    string |
    null;

  counterparties:
    Address[];
};

export type TransactionInterpretation = {
  version:
    typeof TRANSACTION_INTERPRETATION_VERSION;

  headline:
    string;

  plainEnglish:
    string;

  status:
    "success" |
    "reverted";

  network: {
    name:
      string;

    chainId:
      number;

    nativeSymbol:
      string;
  };

  interaction: {
    type:
      | "native_transfer"
      | "token_transfer"
      | "token_approval"
      | "token_transfer_from"
      | "contract_interaction"
      | "contract_creation";

    functionName:
      string |
      null;

    functionSignature:
      string |
      null;

    functionConfidence:
      "verified" |
      "candidate" |
      "unknown";

    contractAddress:
      Address |
      null;

    contractName:
      string |
      null;

    contractVerified:
      boolean;
  };

  protocol:
    ProtocolIdentity;

  swap:
    SwapIntelligence;

  observedWalletEffect: {
    wallet:
      Address;

    tokenEffects:
      ObservedTokenEffect[];

    topLevelNativeSent: {
      amountWei:
        string;

      amountFormatted:
        string;

      symbol:
        string;
    };

    networkFee: {
      amountWei:
        string;

      amountFormatted:
        string;

      symbol:
        string;
    };

    completeNativeNetEffect:
      false;
  };

  whatWeKnow:
    string[];

  whatWeCannotProve:
    string[];

  evidence: {
    deterministic:
      true;

    verifiedAbiUsed:
      boolean;

    officialProtocolAbiUsed:
      boolean;

    aiUsedForFacts:
      false;

    internalNativeTransfersTraced:
      false;
  };
};

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

function shortAddress(
  address:
    Address
): string {
  return (
    address.slice(
      0,
      8
    ) +
    "…" +
    address.slice(
      -6
    )
  );
}

function buildObservedTokenEffects(
  facts:
    UniversalTransactionFacts
): ObservedTokenEffect[] {
  const wallet =
    facts.transaction.from;

  const effects =
    new Map<
      string,
      {
        token:
          Address;

        symbol:
          string |
          null;

        decimals:
          number |
          null;

        delta:
          bigint;

        counterparties:
          Set<Address>;
      }
    >();

  for (
    const transfer
    of facts.tokenTransfers
  ) {
    const fromWallet =
      sameAddress(
        transfer.from,
        wallet
      );

    const toWallet =
      sameAddress(
        transfer.to,
        wallet
      );

    if (
      fromWallet ===
      toWallet
    ) {
      continue;
    }

    const key =
      transfer.token
        .toLowerCase();

    const existing =
      effects.get(
        key
      ) ?? {
        token:
          transfer.token,

        symbol:
          transfer.symbol,

        decimals:
          transfer.decimals,

        delta:
          0n,

        counterparties:
          new Set<Address>(),
      };

    const amount =
      BigInt(
        transfer.amountRaw
      );

    if (
      fromWallet
    ) {
      existing.delta -=
        amount;

      existing.counterparties.add(
        transfer.to
      );
    }

    if (
      toWallet
    ) {
      existing.delta +=
        amount;

      existing.counterparties.add(
        transfer.from
      );
    }

    effects.set(
      key,
      existing
    );
  }

  return [
    ...effects.values(),
  ]
    .filter(
      (
        effect
      ) =>
        effect.delta !==
        0n
    )
    .map(
      (
        effect
      ) => {
        const absolute =
          effect.delta <
          0n
            ? -effect.delta
            : effect.delta;

        return {
          token:
            effect.token,

          symbol:
            effect.symbol,

          decimals:
            effect.decimals,

          direction:
            effect.delta <
            0n
              ? "out"
              : "in",

          amountRaw:
            absolute.toString(),

          amountFormatted:
            effect.decimals ===
            null
              ? null
              : formatUnits(
                  absolute,
                  effect.decimals
                ),

          counterparties:
            [
              ...effect
                .counterparties,
            ],
        };
      }
    );
}

function getInteractionType(
  facts:
    UniversalTransactionFacts
): TransactionInterpretation[
  "interaction"
]["type"] {
  switch (
    facts.action.type
  ) {
    case "native_transfer":
      return "native_transfer";

    case "erc20_transfer":
      return "token_transfer";

    case "erc20_approve":
      return "token_approval";

    case "erc20_transfer_from":
      return "token_transfer_from";

    case "contract_creation":
      return "contract_creation";

    default:
      return "contract_interaction";
  }
}

function buildHeadline(
  facts:
    UniversalTransactionFacts,

  tokenEffects:
    ObservedTokenEffect[]
): string {
  if (
    facts.transaction.status ===
    "reverted"
  ) {
    return "Transaction reverted";
  }

  const outgoing =
    tokenEffects.find(
      (
        effect
      ) =>
        effect.direction ===
        "out"
    );

  if (
    facts.action.type ===
      "erc20_transfer" &&
    outgoing
  ) {
    const amount =
      outgoing.amountFormatted ??
      outgoing.amountRaw;

    const asset =
      outgoing.symbol ??
      "token";

    return (
      amount +
      " " +
      asset +
      " sent"
    );
  }

  if (
    facts.action.type ===
    "erc20_approve"
  ) {
    return "Token spending approval";
  }

  if (
    facts.action.type ===
    "erc20_transfer_from"
  ) {
    return "Token transferFrom call";
  }

  if (
    facts.action.type ===
    "native_transfer"
  ) {
    return (
      facts.transaction
        .nativeValueFormatted +
      " " +
      facts.transaction
        .nativeSymbol +
      " sent"
    );
  }

  if (
    facts.action.type ===
    "contract_creation"
  ) {
    return "Smart contract created";
  }

  return "Smart contract interaction";
}

function buildPlainEnglish(
  facts:
    UniversalTransactionFacts,

  contract:
    ContractIntelligence |
    null,

  tokenEffects:
    ObservedTokenEffect[]
): string {
  if (
    facts.transaction.status ===
    "reverted"
  ) {
    return (
      "This transaction reverted on " +
      facts.subject.network +
      ". The network still charged " +
      facts.transaction
        .transactionFeeFormatted +
      " " +
      facts.transaction
        .nativeSymbol +
      " in gas."
    );
  }

  const outgoing =
    tokenEffects.find(
      (
        effect
      ) =>
        effect.direction ===
        "out"
    );

  if (
    facts.action.type ===
      "erc20_transfer" &&
    outgoing
  ) {
    const recipient =
      facts.action.recipient;

    const amount =
      outgoing.amountFormatted ??
      outgoing.amountRaw;

    const asset =
      outgoing.symbol ??
      "token units";

    const functionText =
      contract
        ?.function
        .signature
        ? ` using the verified function ${contract.function.signature}`
        : "";

    return (
      "The sender transferred " +
      amount +
      " " +
      asset +
      " to " +
      shortAddress(
        recipient
      ) +
      functionText +
      ". The transaction succeeded on " +
      facts.subject.network +
      " and cost " +
      facts.transaction
        .transactionFeeFormatted +
      " " +
      facts.transaction
        .nativeSymbol +
      " in network fees."
    );
  }

  if (
    facts.action.type ===
    "native_transfer"
  ) {
    return (
      "The sender transferred " +
      facts.transaction
        .nativeValueFormatted +
      " " +
      facts.transaction
        .nativeSymbol +
      " to " +
      (
        facts.transaction.to
          ? shortAddress(
              facts.transaction.to
            )
          : "the destination"
      ) +
      ". The transaction succeeded on " +
      facts.subject.network +
      "."
    );
  }

  if (
    facts.action.type ===
    "contract_creation"
  ) {
    return (
      "This transaction created a new smart contract on " +
      facts.subject.network +
      "."
    );
  }

  const functionText =
    contract
      ?.function
      .signature
      ? (
          contract.function
            .confidence ===
          "verified"
            ? " The verified function is " +
              contract.function.signature +
              "."
            : " A signature database suggests " +
              contract.function.signature +
              ", but that function identity is not verified."
        )
      : "";

  return (
    "This transaction interacted with a smart contract on " +
    facts.subject.network +
    "." +
    functionText +
    " BOUND does not infer the purpose of the contract without additional evidence."
  );
}

export function interpretTransaction(
  facts:
    UniversalTransactionFacts,

  contract:
    ContractIntelligence |
    null
): TransactionInterpretation {
  const tokenEffects =
    buildObservedTokenEffects(
      facts
    );

  const initialProtocol =
    resolveProtocolIdentity(
      facts,
      contract
    );

  const resolvedContract =
    refineContractWithOfficialProtocolAbi(
      facts,
      contract,
      initialProtocol
    );

  const protocol =
    resolveProtocolIdentity(
      facts,
      resolvedContract
    );

  const swap =
    resolveSwapIntelligence(
      facts,
      resolvedContract,
      protocol
    );

  const whatWeKnow:
    string[] = [
      `Transaction status: ${facts.transaction.status}.`,
      `Network: ${facts.subject.network} (${facts.subject.chainId}).`,
      `Network fee: ${facts.transaction.transactionFeeFormatted} ${facts.transaction.nativeSymbol}.`,
    ];

  if (
    resolvedContract
      ?.contract
      .verified
  ) {
    whatWeKnow.push(
      `The destination contract is verified${resolvedContract.contract.name ? ` as ${resolvedContract.contract.name}` : ""}.`
    );
  }

  if (
    resolvedContract
      ?.function
      .confidence ===
      "verified" &&
    resolvedContract.function.signature
  ) {
    whatWeKnow.push(
      `The called function is verified as ${resolvedContract.function.signature}.`
    );
  }

  for (
    const effect
    of tokenEffects
  ) {
    whatWeKnow.push(
      `Observed wallet token effect: ${effect.direction === "out" ? "-" : "+"}${effect.amountFormatted ?? effect.amountRaw} ${effect.symbol ?? effect.token}.`
    );
  }

  const whatWeCannotProve:
    string[] = [
      "The blockchain transaction alone does not prove why the payment or interaction happened.",
      "BOUND does not infer an off-chain purchase, agreement, or user intention from transaction data alone.",
      "Internal native-asset movements are not included because this version does not use execution traces.",
    ];

  if (
    protocol.status ===
    "unknown"
  ) {
    whatWeCannotProve.push(
      "The destination contract has not been reliably mapped to a known protocol or dApp."
    );
  }

  return {
    version:
      TRANSACTION_INTERPRETATION_VERSION,

    headline:
      swap.status ===
        "identified"
        ? (
            "Swap via " +
            (
              protocol.name ??
              "DEX"
            )
          )
        : buildHeadline(
            facts,
            tokenEffects
          ),

    plainEnglish:
      swap.status ===
        "identified" &&
      swap.summary
        ? (
            swap.summary +
            " The transaction succeeded on " +
            facts.subject.network +
            " and cost " +
            facts.transaction
              .transactionFeeFormatted +
            " " +
            facts.transaction
              .nativeSymbol +
            " in network fees."
          )
        : buildPlainEnglish(
            facts,
            contract,
            tokenEffects
          ),

    status:
      facts.transaction.status,

    network: {
      name:
        facts.subject.network,

      chainId:
        facts.subject.chainId,

      nativeSymbol:
        facts.subject.nativeSymbol,
    },

    interaction: {
      type:
        getInteractionType(
          facts
        ),

      functionName:
        resolvedContract
          ?.function
          .name ??
        null,

      functionSignature:
        resolvedContract
          ?.function
          .signature ??
        null,

      functionConfidence:
        resolvedContract
          ?.function
          .confidence ??
        "unknown",

      contractAddress:
        facts.transaction.to,

      contractName:
        resolvedContract
          ?.contract
          .name ??
        null,

      contractVerified:
        resolvedContract
          ?.contract
          .verified ??
        false,
    },

    protocol,

    swap,

    observedWalletEffect: {
      wallet:
        facts.transaction.from,

      tokenEffects,

      topLevelNativeSent: {
        amountWei:
          facts.transaction
            .nativeValueWei,

        amountFormatted:
          facts.transaction
            .nativeValueFormatted,

        symbol:
          facts.transaction
            .nativeSymbol,
      },

      networkFee: {
        amountWei:
          facts.transaction
            .transactionFeeWei,

        amountFormatted:
          facts.transaction
            .transactionFeeFormatted,

        symbol:
          facts.transaction
            .nativeSymbol,
      },

      completeNativeNetEffect:
        false,
    },

    whatWeKnow,

    whatWeCannotProve,

    evidence: {
      deterministic:
        true,

      verifiedAbiUsed:
        resolvedContract
          ?.function
          .confidence ===
        "verified",

      officialProtocolAbiUsed:
        resolvedContract
          ?.evidence
          .officialProtocolAbiUsed ===
        true,

      aiUsedForFacts:
        false,

      internalNativeTransfersTraced:
        false,
    },
  };
}
