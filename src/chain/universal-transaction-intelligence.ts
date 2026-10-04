import {
  createPublicClient,
  decodeAbiParameters,
  formatUnits,
  http,
  keccak256,
  parseAbi,
  parseAbiParameters,
  toBytes,
  type Address,
  type Hash,
  type Hex,
} from "viem";

import {
  type EvmNetworkDefinition,
  type EvmNetworkId,
} from "./evm-network-registry.js";

import {
  discoverTransactionNetwork,
  getNetworkRpcUrl,
  NETWORK_CHAINS,
} from "./transaction-network-discovery.js";

import {
  normalizeUniversalTransactionInput,
} from "./universal-transaction-input.js";

export const UNIVERSAL_TX_FACTS_VERSION =
  "bound.universal-transaction-facts.v1" as const;

const TRANSFER_TOPIC =
  keccak256(
    toBytes(
      "Transfer(address,address,uint256)"
    )
  );

const ERC20_METADATA_ABI =
  parseAbi([
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
  ]);

const transferParameters =
  parseAbiParameters(
    "address to, uint256 amount"
  );

const approveParameters =
  parseAbiParameters(
    "address spender, uint256 amount"
  );

const transferFromParameters =
  parseAbiParameters(
    "address from, address to, uint256 amount"
  );

export type UniversalTransactionAction =
  | {
      type:
        "native_transfer";
    }
  | {
      type:
        "contract_creation";
    }
  | {
      type:
        "erc20_transfer";

      recipient:
        Address;

      amountRaw:
        string;
    }
  | {
      type:
        "erc20_approve";

      spender:
        Address;

      amountRaw:
        string;
    }
  | {
      type:
        "erc20_transfer_from";

      sender:
        Address;

      recipient:
        Address;

      amountRaw:
        string;
    }
  | {
      type:
        "contract_call";

      selector:
        Hex;
    };

export type UniversalTransactionFacts = {
  version:
    typeof UNIVERSAL_TX_FACTS_VERSION;

  subject: {
    type:
      "evm_transaction";

    chainId:
      number;

    networkId:
      EvmNetworkId;

    network:
      string;

    nativeSymbol:
      string;

    transactionHash:
      Hash;

    explorerUrl:
      string;
  };

  transaction: {
    status:
      "success" |
      "reverted";

    from:
      Address;

    to:
      Address |
      null;

    blockNumber:
      string;

    blockTimestamp:
      string;

    nativeValueWei:
      string;

    nativeValueFormatted:
      string;

    nativeSymbol:
      string;

    nonce:
      number;

    gasUsed:
      string;

    effectiveGasPriceWei:
      string;

    transactionFeeWei:
      string;

    transactionFeeFormatted:
      string;

    input:
      Hex;

    selector:
      Hex |
      null;
  };

  action:
    UniversalTransactionAction;

  tokenTransfers:
    Array<{
      token:
        Address;

      symbol:
        string |
        null;

      decimals:
        number |
        null;

      from:
        Address;

      to:
        Address;

      amountRaw:
        string;

      amountFormatted:
        string |
        null;
    }>;

  evidence: {
    networkResolution:
      "explorer_hint" |
      "cross_network_discovery";

    transactionFetchedFromRpc:
      true;

    receiptFetchedFromRpc:
      true;

    blockFetchedFromRpc:
      true;

    aiUsedForFacts:
      false;
  };
};

function topicToAddress(
  topic: Hex
): Address {
  return (
    `0x${topic.slice(-40)}` as
      Address
  );
}

export function decodeUniversalTopLevelAction(
  to:
    Address |
    null,

  data:
    Hex
): UniversalTransactionAction {
  if (
    to ===
    null
  ) {
    return {
      type:
        "contract_creation",
    };
  }

  if (
    data ===
    "0x"
  ) {
    return {
      type:
        "native_transfer",
    };
  }

  const selector =
    data.slice(
      0,
      10
    ) as Hex;

  const params =
    `0x${data.slice(10)}` as Hex;

  try {
    if (
      selector.toLowerCase() ===
      "0xa9059cbb"
    ) {
      const [
        recipient,
        amount,
      ] =
        decodeAbiParameters(
          transferParameters,
          params
        );

      return {
        type:
          "erc20_transfer",

        recipient,

        amountRaw:
          amount.toString(),
      };
    }

    if (
      selector.toLowerCase() ===
      "0x095ea7b3"
    ) {
      const [
        spender,
        amount,
      ] =
        decodeAbiParameters(
          approveParameters,
          params
        );

      return {
        type:
          "erc20_approve",

        spender,

        amountRaw:
          amount.toString(),
      };
    }

    if (
      selector.toLowerCase() ===
      "0x23b872dd"
    ) {
      const [
        sender,
        recipient,
        amount,
      ] =
        decodeAbiParameters(
          transferFromParameters,
          params
        );

      return {
        type:
          "erc20_transfer_from",

        sender,

        recipient,

        amountRaw:
          amount.toString(),
      };
    }
  } catch {
    // Never invent decoded facts.
  }

  return {
    type:
      "contract_call",

    selector,
  };
}

async function resolveNetwork(
  value:
    string
): Promise<{
  hash:
    Hash;

  network:
    EvmNetworkDefinition;

  resolution:
    "explorer_hint" |
    "cross_network_discovery";
}> {
  const normalized =
    normalizeUniversalTransactionInput(
      value
    );

  if (
    normalized.networkHint
  ) {
    return {
      hash:
        normalized.hash,

      network:
        normalized.networkHint,

      resolution:
        "explorer_hint",
    };
  }

  const discovery =
    await discoverTransactionNetwork(
      normalized.hash
    );

  if (
    discovery.status ===
      "FOUND" &&
    discovery.network
  ) {
    return {
      hash:
        normalized.hash,

      network:
        discovery.network,

      resolution:
        "cross_network_discovery",
    };
  }

  if (
    discovery.status ===
    "AMBIGUOUS"
  ) {
    throw new Error(
      "This transaction hash was found on multiple supported networks: " +
      discovery.matches
        .map(
          (
            network
          ) =>
            network.name
        )
        .join(
          ", "
        ) +
      ". Paste the transaction explorer URL so BOUND can identify the intended network."
    );
  }

  if (
    discovery.status ===
    "INCONCLUSIVE"
  ) {
    throw new Error(
      "BOUND could not determine the transaction network because some network RPCs were unavailable. Try the explorer URL or retry shortly."
    );
  }

  throw new Error(
    "Transaction not found on the networks currently supported by BOUND."
  );
}

export async function fetchUniversalTransactionFacts(
  value:
    string
): Promise<
  UniversalTransactionFacts
> {
  const {
    hash,
    network,
    resolution,
  } =
    await resolveNetwork(
      value
    );

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

  const [
    transaction,
    receipt,
  ] =
    await Promise.all([
      client.getTransaction({
        hash,
      }),

      client.getTransactionReceipt({
        hash,
      }),
    ]);

  const block =
    await client.getBlock({
      blockNumber:
        receipt.blockNumber,
    });

  const rawTransfers =
    receipt.logs.flatMap(
      (
        log
      ) => {
        /*
         * ERC-20 Transfer has:
         * topic0 = signature
         * topic1 = from
         * topic2 = to
         * data   = amount
         *
         * ERC-721 uses an indexed tokenId,
         * normally producing a fourth topic.
         * Do not mislabel those as ERC-20.
         */
        if (
          log.topics.length !==
            3 ||
          log.topics[0]
            ?.toLowerCase() !==
            TRANSFER_TOPIC
              .toLowerCase() ||
          log.data ===
            "0x"
        ) {
          return [];
        }

        const fromTopic =
          log.topics[1];

        const toTopic =
          log.topics[2];

        if (
          !fromTopic ||
          !toTopic
        ) {
          return [];
        }

        let amount:
          bigint;

        try {
          amount =
            BigInt(
              log.data
            );
        } catch {
          return [];
        }

        return [
          {
            token:
              log.address,

            from:
              topicToAddress(
                fromTopic
              ),

            to:
              topicToAddress(
                toTopic
              ),

            amount,
          },
        ];
      }
    );

  const metadata =
    new Map<
      string,
      {
        symbol:
          string |
          null;

        decimals:
          number |
          null;
      }
    >();

  for (
    const transfer
    of rawTransfers
  ) {
    const key =
      transfer.token
        .toLowerCase();

    if (
      metadata.has(
        key
      )
    ) {
      continue;
    }

    const [
      symbolResult,
      decimalsResult,
    ] =
      await Promise.allSettled([
        client.readContract({
          address:
            transfer.token,

          abi:
            ERC20_METADATA_ABI,

          functionName:
            "symbol",
        }),

        client.readContract({
          address:
            transfer.token,

          abi:
            ERC20_METADATA_ABI,

          functionName:
            "decimals",
        }),
      ]);

    metadata.set(
      key,
      {
        symbol:
          symbolResult.status ===
          "fulfilled"
            ? symbolResult.value
            : null,

        decimals:
          decimalsResult.status ===
          "fulfilled"
            ? Number(
                decimalsResult.value
              )
            : null,
      }
    );
  }

  const tokenTransfers =
    rawTransfers.map(
      (
        transfer
      ) => {
        const tokenMetadata =
          metadata.get(
            transfer.token
              .toLowerCase()
          ) ?? {
            symbol:
              null,

            decimals:
              null,
          };

        return {
          token:
            transfer.token,

          symbol:
            tokenMetadata.symbol,

          decimals:
            tokenMetadata.decimals,

          from:
            transfer.from,

          to:
            transfer.to,

          amountRaw:
            transfer.amount
              .toString(),

          amountFormatted:
            tokenMetadata.decimals ===
            null
              ? null
              : formatUnits(
                  transfer.amount,
                  tokenMetadata.decimals
                ),
        };
      }
    );

  const fee =
    receipt.gasUsed *
    receipt.effectiveGasPrice;

  const nativeValueFormatted =
    formatUnits(
      transaction.value,
      18
    );

  const transactionFeeFormatted =
    formatUnits(
      fee,
      18
    );

  return {
    version:
      UNIVERSAL_TX_FACTS_VERSION,

    subject: {
      type:
        "evm_transaction",

      chainId:
        network.chainId,

      networkId:
        network.id,

      network:
        network.name,

      nativeSymbol:
        network.nativeSymbol,

      transactionHash:
        hash,

      explorerUrl:
        network.explorerBaseUrl +
        "/tx/" +
        hash,
    },

    transaction: {
      status:
        receipt.status,

      from:
        transaction.from,

      to:
        transaction.to,

      blockNumber:
        receipt.blockNumber
          .toString(),

      blockTimestamp:
        block.timestamp
          .toString(),

      nativeValueWei:
        transaction.value
          .toString(),

      nativeValueFormatted,

      nativeSymbol:
        network.nativeSymbol,

      nonce:
        transaction.nonce,

      gasUsed:
        receipt.gasUsed
          .toString(),

      effectiveGasPriceWei:
        receipt
          .effectiveGasPrice
          .toString(),

      transactionFeeWei:
        fee.toString(),

      transactionFeeFormatted,

      input:
        transaction.input,

      selector:
        transaction.input ===
        "0x"
          ? null
          : (
              transaction.input.slice(
                0,
                10
              ) as Hex
            ),
    },

    action:
      decodeUniversalTopLevelAction(
        transaction.to,
        transaction.input
      ),

    tokenTransfers,

    evidence: {
      networkResolution:
        resolution,

      transactionFetchedFromRpc:
        true,

      receiptFetchedFromRpc:
        true,

      blockFetchedFromRpc:
        true,

      aiUsedForFacts:
        false,
    },
  };
}
