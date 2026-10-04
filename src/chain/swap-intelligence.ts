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

import type {
  ProtocolIdentity,
} from "./protocol-intelligence.js";

export const SWAP_INTELLIGENCE_VERSION =
  "bound.swap-intelligence.v1" as const;

export type SwapAsset = {
  type:
    | "native"
    | "token";

  address:
    Address |
    null;

  symbol:
    string |
    null;

  amountRaw:
    string;

  amountFormatted:
    string |
    null;
};

export type SwapIntelligence = {
  version:
    typeof SWAP_INTELLIGENCE_VERSION;

  status:
    | "identified"
    | "not_swap"
    | "insufficient_evidence";

  kind:
    | "native_to_token"
    | "token_to_token"
    | "token_to_native"
    | null;

  protocol: {
    name:
      string |
      null;

    component:
      string |
      null;
  };

  function: {
    name:
      string |
      null;

    signature:
      string |
      null;

    confidence:
      "verified" |
      "candidate" |
      "unknown";
  };

  sent:
    SwapAsset |
    null;

  received:
    SwapAsset |
    null;

  summary:
    string |
    null;

  reason:
    string;

  completeAssetFlow:
    boolean;

  evidence: {
    protocolIdentified:
      boolean;

    protocolConfidence:
      string;

    verifiedSwapFunction:
      boolean;

    walletTokenMovementsUsed:
      number;

    topLevelNativeValueUsed:
      boolean;

    internalNativeTransfersTraced:
      false;

    aiUsedForFacts:
      false;
  };
};

type TokenDelta = {
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

function buildWalletTokenDeltas(
  facts:
    UniversalTransactionFacts
): TokenDelta[] {
  const wallet =
    facts.transaction.from;

  const deltas =
    new Map<
      string,
      TokenDelta
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

    const current =
      deltas.get(
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
      };

    const amount =
      BigInt(
        transfer.amountRaw
      );

    if (
      fromWallet
    ) {
      current.delta -=
        amount;
    }

    if (
      toWallet
    ) {
      current.delta +=
        amount;
    }

    deltas.set(
      key,
      current
    );
  }

  return [
    ...deltas.values(),
  ].filter(
    (
      delta
    ) =>
      delta.delta !==
      0n
  );
}

function tokenAsset(
  delta:
    TokenDelta
): SwapAsset {
  const absolute =
    delta.delta <
    0n
      ? -delta.delta
      : delta.delta;

  return {
    type:
      "token",

    address:
      delta.token,

    symbol:
      delta.symbol,

    amountRaw:
      absolute.toString(),

    amountFormatted:
      delta.decimals ===
      null
        ? null
        : formatUnits(
            absolute,
            delta.decimals
          ),
  };
}

function displayAsset(
  asset:
    SwapAsset
): string {
  return (
    (
      asset.amountFormatted ??
      asset.amountRaw
    ) +
    " " +
    (
      asset.symbol ??
      (
        asset.type ===
        "native"
          ? "native asset"
          : "token"
      )
    )
  );
}

function isSwapFunction(
  contract:
    ContractIntelligence |
    null
): boolean {
  const name =
    contract
      ?.function
      .name
      ?.toLowerCase();

  return Boolean(
    name &&
    name.startsWith(
      "swap"
    )
  );
}

function baseResult(
  protocol:
    ProtocolIdentity,

  contract:
    ContractIntelligence |
    null
) {
  return {
    version:
      SWAP_INTELLIGENCE_VERSION,

    protocol: {
      name:
        protocol.name,

      component:
        protocol.component,
    },

    function: {
      name:
        contract
          ?.function
          .name ??
        null,

      signature:
        contract
          ?.function
          .signature ??
        null,

      confidence:
        contract
          ?.function
          .confidence ??
        "unknown",
    },
  };
}

export function resolveSwapIntelligence(
  facts:
    UniversalTransactionFacts,

  contract:
    ContractIntelligence |
    null,

  protocol:
    ProtocolIdentity
): SwapIntelligence {
  const base =
    baseResult(
      protocol,
      contract
    );

  const tokenDeltas =
    buildWalletTokenDeltas(
      facts
    );

  const outgoing =
    tokenDeltas.filter(
      (
        delta
      ) =>
        delta.delta <
        0n
    );

  const incoming =
    tokenDeltas.filter(
      (
        delta
      ) =>
        delta.delta >
        0n
    );

  const nativeValue =
    BigInt(
      facts.transaction
        .nativeValueWei
    );

  const protocolIsDex =
    protocol.status ===
      "identified" &&
    protocol.category ===
      "dex";

  if (
    !protocolIsDex
  ) {
    return {
      ...base,

      status:
        "not_swap",

      kind:
        null,

      sent:
        null,

      received:
        null,

      summary:
        null,

      reason:
        "The destination is not identified as a supported DEX protocol.",

      completeAssetFlow:
        false,

      evidence: {
        protocolIdentified:
          protocol.status ===
          "identified",

        protocolConfidence:
          protocol.confidence,

        verifiedSwapFunction:
          false,

        walletTokenMovementsUsed:
          tokenDeltas.length,

        topLevelNativeValueUsed:
          false,

        internalNativeTransfersTraced:
          false,

        aiUsedForFacts:
          false,
      },
    };
  }

  if (
    !isSwapFunction(
      contract
    )
  ) {
    return {
      ...base,

      status:
        "not_swap",

      kind:
        null,

      sent:
        null,

      received:
        null,

      summary:
        null,

      reason:
        "The protocol is a DEX, but the called function is not identified as a swap function.",

      completeAssetFlow:
        false,

      evidence: {
        protocolIdentified:
          true,

        protocolConfidence:
          protocol.confidence,

        verifiedSwapFunction:
          false,

        walletTokenMovementsUsed:
          tokenDeltas.length,

        topLevelNativeValueUsed:
          false,

        internalNativeTransfersTraced:
          false,

        aiUsedForFacts:
          false,
      },
    };
  }

  if (
    contract
      ?.function
      .confidence !==
    "verified"
  ) {
    return {
      ...base,

      status:
        "insufficient_evidence",

      kind:
        null,

      sent:
        null,

      received:
        null,

      summary:
        null,

      reason:
        "BOUND found a possible swap function, but its function identity is not verified.",

      completeAssetFlow:
        false,

      evidence: {
        protocolIdentified:
          true,

        protocolConfidence:
          protocol.confidence,

        verifiedSwapFunction:
          false,

        walletTokenMovementsUsed:
          tokenDeltas.length,

        topLevelNativeValueUsed:
          false,

        internalNativeTransfersTraced:
          false,

        aiUsedForFacts:
          false,
      },
    };
  }

  /*
   * Native -> token.
   *
   * Native input is directly visible in transaction.value.
   * Token output is visible from Transfer logs to the wallet.
   */
  if (
    nativeValue >
      0n &&
    outgoing.length ===
      0 &&
    incoming.length ===
      1
  ) {
    const sent:
      SwapAsset = {
        type:
          "native",

        address:
          null,

        symbol:
          facts.transaction
            .nativeSymbol,

        amountRaw:
          nativeValue.toString(),

        amountFormatted:
          facts.transaction
            .nativeValueFormatted,
      };

    const received =
      tokenAsset(
        incoming[0]!
      );

    return {
      ...base,

      status:
        "identified",

      kind:
        "native_to_token",

      sent,

      received,

      summary:
        `You swapped ${displayAsset(sent)} for ${displayAsset(received)} through ${protocol.name}.`,

      reason:
        "The verified DEX swap call sent native value and the wallet received one token asset.",

      completeAssetFlow:
        true,

      evidence: {
        protocolIdentified:
          true,

        protocolConfidence:
          protocol.confidence,

        verifiedSwapFunction:
          true,

        walletTokenMovementsUsed:
          tokenDeltas.length,

        topLevelNativeValueUsed:
          true,

        internalNativeTransfersTraced:
          false,

        aiUsedForFacts:
          false,
      },
    };
  }

  /*
   * Token -> token.
   *
   * Both sides are observable from ERC-20 Transfer logs
   * involving the user's wallet.
   */
  if (
    nativeValue ===
      0n &&
    outgoing.length ===
      1 &&
    incoming.length ===
      1
  ) {
    const sent =
      tokenAsset(
        outgoing[0]!
      );

    const received =
      tokenAsset(
        incoming[0]!
      );

    return {
      ...base,

      status:
        "identified",

      kind:
        "token_to_token",

      sent,

      received,

      summary:
        `You swapped ${displayAsset(sent)} for ${displayAsset(received)} through ${protocol.name}.`,

      reason:
        "The verified DEX swap call produced one outgoing and one incoming token effect for the wallet.",

      completeAssetFlow:
        true,

      evidence: {
        protocolIdentified:
          true,

        protocolConfidence:
          protocol.confidence,

        verifiedSwapFunction:
          true,

        walletTokenMovementsUsed:
          tokenDeltas.length,

        topLevelNativeValueUsed:
          false,

        internalNativeTransfersTraced:
          false,

        aiUsedForFacts:
          false,
      },
    };
  }

  /*
   * Token -> native cannot yet expose a deterministic
   * received native amount because this version does not
   * trace internal native transfers.
   */
  if (
    nativeValue ===
      0n &&
    outgoing.length ===
      1 &&
    incoming.length ===
      0
  ) {
    const functionName =
      contract
        ?.function
        .name
        ?.toLowerCase() ??
      "";

    if (
      functionName.includes(
        "eth"
      ) ||
      functionName.includes(
        "bnb"
      )
    ) {
      return {
        ...base,

        status:
          "insufficient_evidence",

        kind:
          "token_to_native",

        sent:
          tokenAsset(
            outgoing[0]!
          ),

        received:
          null,

        summary:
          null,

        reason:
          "The verified function indicates a token-to-native swap, but BOUND has not traced the internal native transfer needed to prove the received amount.",

        completeAssetFlow:
          false,

        evidence: {
          protocolIdentified:
            true,

          protocolConfidence:
            protocol.confidence,

          verifiedSwapFunction:
            true,

          walletTokenMovementsUsed:
            tokenDeltas.length,

          topLevelNativeValueUsed:
            false,

          internalNativeTransfersTraced:
            false,

          aiUsedForFacts:
            false,
        },
      };
    }
  }

  return {
    ...base,

    status:
      "insufficient_evidence",

    kind:
      null,

    sent:
      null,

    received:
      null,

    summary:
      null,

    reason:
      "BOUND verified a DEX swap call, but the observed wallet asset movements are not simple enough to describe as one input and one output without additional tracing.",

    completeAssetFlow:
      false,

    evidence: {
      protocolIdentified:
        true,

      protocolConfidence:
        protocol.confidence,

      verifiedSwapFunction:
        true,

      walletTokenMovementsUsed:
        tokenDeltas.length,

      topLevelNativeValueUsed:
        nativeValue >
        0n,

      internalNativeTransfersTraced:
        false,

      aiUsedForFacts:
        false,
    },
  };
}
