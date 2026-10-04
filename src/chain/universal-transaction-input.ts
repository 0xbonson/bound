import {
  type Hash,
} from "viem";

import {
  getEvmNetworkByExplorerHost,
  type EvmNetworkDefinition,
} from "./evm-network-registry.js";

const TX_HASH_PATTERN =
  /^0x[a-fA-F0-9]{64}$/;

export type UniversalTransactionInput = {
  hash: Hash;

  source:
    | "transaction_hash"
    | "explorer_url";

  networkHint:
    EvmNetworkDefinition |
    null;

  explorerHost:
    string |
    null;
};

function parseTransactionHashFromPath(
  pathname: string
): Hash {
  const parts =
    pathname
      .split("/")
      .filter(Boolean);

  const txIndex =
    parts.findIndex(
      (
        part
      ) =>
        part.toLowerCase() ===
        "tx"
    );

  if (
    txIndex ===
    -1
  ) {
    throw new Error(
      "The URL does not point to a transaction."
    );
  }

  const hash =
    parts[
      txIndex +
      1
    ];

  if (
    !hash ||
    !TX_HASH_PATTERN.test(
      hash
    )
  ) {
    throw new Error(
      "The transaction URL does not contain a valid EVM transaction hash."
    );
  }

  return hash as Hash;
}

export function normalizeUniversalTransactionInput(
  value: string
): UniversalTransactionInput {
  const input =
    value.trim();

  if (
    TX_HASH_PATTERN.test(
      input
    )
  ) {
    return {
      hash:
        input as Hash,

      source:
        "transaction_hash",

      networkHint:
        null,

      explorerHost:
        null,
    };
  }

  let url:
    URL;

  try {
    url =
      new URL(
        input
      );
  } catch {
    throw new Error(
      "Enter an EVM transaction hash or transaction explorer URL."
    );
  }

  if (
    url.protocol !==
      "https:" &&
    url.protocol !==
      "http:"
  ) {
    throw new Error(
      "Transaction explorer URLs must use HTTP or HTTPS."
    );
  }

  const hash =
    parseTransactionHashFromPath(
      url.pathname
    );

  const networkHint =
    getEvmNetworkByExplorerHost(
      url.hostname
    );

  return {
    hash,

    source:
      "explorer_url",

    networkHint,

    explorerHost:
      url.hostname
        .toLowerCase(),
  };
}
