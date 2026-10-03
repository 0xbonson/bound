import {
  createPublicClient,
  decodeAbiParameters,
  formatEther,
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
import { bscTestnet } from "viem/chains";

export const BOUND_TX_FACTS_VERSION =
  "bound.transaction-facts.v1" as const;

export const BSC_TESTNET_RPC_URL =
  process.env.BSC_TESTNET_RPC_URL ??
  process.env.BSC_RPC_URL ??
  ("https://" +
    "bsc-testnet-dataseed.bnbchain.org");

const TX_HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;

const TRANSFER_TOPIC = keccak256(
  toBytes("Transfer(address,address,uint256)"),
);

const ERC20_METADATA_ABI = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

const transferParameters =
  parseAbiParameters("address to, uint256 amount");

const approveParameters =
  parseAbiParameters("address spender, uint256 amount");

const transferFromParameters =
  parseAbiParameters(
    "address from, address to, uint256 amount",
  );

export type NormalizedTransactionInput = {
  hash: Hash;
  source: "transaction_hash" | "bscscan_url";
};

export type TransactionFacts = {
  version: typeof BOUND_TX_FACTS_VERSION;

  subject: {
    type: "evm_transaction";
    chainId: 97;
    network: "bsc-testnet";
    transactionHash: Hash;
    explorerUrl: string;
  };

  transaction: {
    status: "success" | "reverted";
    from: Address;
    to: Address | null;
    blockNumber: string;
    blockTimestamp: string;
    nativeValueWei: string;
    nativeValueBNB: string;
    nonce: number;
    gasUsed: string;
    effectiveGasPriceWei: string;
    transactionFeeWei: string;
    transactionFeeBNB: string;
    input: Hex;
    selector: Hex | null;
  };

  action:
    | { type: "native_transfer" }
    | { type: "contract_creation" }
    | {
        type: "erc20_transfer";
        recipient: Address;
        amountRaw: string;
      }
    | {
        type: "erc20_approve";
        spender: Address;
        amountRaw: string;
      }
    | {
        type: "erc20_transfer_from";
        sender: Address;
        recipient: Address;
        amountRaw: string;
      }
    | {
        type: "contract_call";
        selector: Hex;
      };

  tokenTransfers: Array<{
    token: Address;
    symbol: string | null;
    decimals: number | null;
    from: Address;
    to: Address;
    amountRaw: string;
    amountFormatted: string | null;
  }>;

  evidence: {
    transactionFetchedFromRpc: true;
    receiptFetchedFromRpc: true;
    blockFetchedFromRpc: true;
    aiUsedForFacts: false;
  };
};

export function normalizeTransactionInput(
  value: string,
): NormalizedTransactionInput {
  const input = value.trim();

  if (TX_HASH_PATTERN.test(input)) {
    return {
      hash: input as Hash,
      source: "transaction_hash",
    };
  }

  let url: URL;

  try {
    url = new URL(input);
  } catch {
    throw new Error(
      "Enter a valid BSC Testnet transaction hash or BscScan transaction URL.",
    );
  }

  const hostname = url.hostname.toLowerCase();

  if (
    hostname !== "testnet.bscscan.com" &&
    hostname !== "www.testnet.bscscan.com"
  ) {
    throw new Error(
      "BOUND currently accepts BSC Testnet BscScan URLs only.",
    );
  }

  const parts = url.pathname
    .split("/")
    .filter(Boolean);

  if (
    parts.length < 2 ||
    parts[0]?.toLowerCase() !== "tx"
  ) {
    throw new Error(
      "The BscScan URL must point to a transaction.",
    );
  }

  const hash = parts[1];

  if (!hash || !TX_HASH_PATTERN.test(hash)) {
    throw new Error(
      "The BscScan URL does not contain a valid transaction hash.",
    );
  }

  return {
    hash: hash as Hash,
    source: "bscscan_url",
  };
}

function topicToAddress(topic: Hex): Address {
  return `0x${topic.slice(-40)}` as Address;
}

function decodeTopLevelAction(
  to: Address | null,
  data: Hex,
): TransactionFacts["action"] {
  if (to === null) {
    return {
      type: "contract_creation",
    };
  }

  if (data === "0x") {
    return {
      type: "native_transfer",
    };
  }

  const selector = data.slice(0, 10) as Hex;
  const params = `0x${data.slice(10)}` as Hex;

  try {
    if (selector.toLowerCase() === "0xa9059cbb") {
      const [recipient, amount] =
        decodeAbiParameters(
          transferParameters,
          params,
        );

      return {
        type: "erc20_transfer",
        recipient,
        amountRaw: amount.toString(),
      };
    }

    if (selector.toLowerCase() === "0x095ea7b3") {
      const [spender, amount] =
        decodeAbiParameters(
          approveParameters,
          params,
        );

      return {
        type: "erc20_approve",
        spender,
        amountRaw: amount.toString(),
      };
    }

    if (selector.toLowerCase() === "0x23b872dd") {
      const [sender, recipient, amount] =
        decodeAbiParameters(
          transferFromParameters,
          params,
        );

      return {
        type: "erc20_transfer_from",
        sender,
        recipient,
        amountRaw: amount.toString(),
      };
    }
  } catch {
    // Never invent decoded facts.
  }

  return {
    type: "contract_call",
    selector,
  };
}

export async function fetchTransactionFacts(
  value: string,
): Promise<TransactionFacts> {
  const normalized =
    normalizeTransactionInput(value);

  const client = createPublicClient({
    chain: bscTestnet,
    transport: http(BSC_TESTNET_RPC_URL),
  });

  const [transaction, receipt] =
    await Promise.all([
      client.getTransaction({
        hash: normalized.hash,
      }),
      client.getTransactionReceipt({
        hash: normalized.hash,
      }),
    ]);

  const block = await client.getBlock({
    blockNumber: receipt.blockNumber,
  });

  const rawTransfers = receipt.logs.flatMap(
    (log) => {
      if (
        log.topics.length < 3 ||
        log.topics[0]?.toLowerCase() !==
          TRANSFER_TOPIC.toLowerCase()
      ) {
        return [];
      }

      const fromTopic = log.topics[1];
      const toTopic = log.topics[2];

      if (!fromTopic || !toTopic) {
        return [];
      }

      let amount: bigint;

      try {
        amount = BigInt(log.data);
      } catch {
        return [];
      }

      return [
        {
          token: log.address,
          from: topicToAddress(fromTopic),
          to: topicToAddress(toTopic),
          amount,
        },
      ];
    },
  );

  const metadata = new Map<
    string,
    {
      symbol: string | null;
      decimals: number | null;
    }
  >();

  for (const transfer of rawTransfers) {
    const key = transfer.token.toLowerCase();

    if (metadata.has(key)) {
      continue;
    }

    const [symbolResult, decimalsResult] =
      await Promise.allSettled([
        client.readContract({
          address: transfer.token,
          abi: ERC20_METADATA_ABI,
          functionName: "symbol",
        }),
        client.readContract({
          address: transfer.token,
          abi: ERC20_METADATA_ABI,
          functionName: "decimals",
        }),
      ]);

    metadata.set(key, {
      symbol:
        symbolResult.status === "fulfilled"
          ? symbolResult.value
          : null,

      decimals:
        decimalsResult.status === "fulfilled"
          ? Number(decimalsResult.value)
          : null,
    });
  }

  const tokenTransfers =
    rawTransfers.map((transfer) => {
      const tokenMetadata =
        metadata.get(
          transfer.token.toLowerCase(),
        ) ?? {
          symbol: null,
          decimals: null,
        };

      return {
        token: transfer.token,
        symbol: tokenMetadata.symbol,
        decimals: tokenMetadata.decimals,
        from: transfer.from,
        to: transfer.to,
        amountRaw: transfer.amount.toString(),
        amountFormatted:
          tokenMetadata.decimals === null
            ? null
            : formatUnits(
                transfer.amount,
                tokenMetadata.decimals,
              ),
      };
    });

  const fee =
    receipt.gasUsed *
    receipt.effectiveGasPrice;

  return {
    version: BOUND_TX_FACTS_VERSION,

    subject: {
      type: "evm_transaction",
      chainId: 97,
      network: "bsc-testnet",
      transactionHash: normalized.hash,
      explorerUrl:
        "https://" +
        "testnet.bscscan.com/tx/" +
        normalized.hash,
    },

    transaction: {
      status: receipt.status,
      from: transaction.from,
      to: transaction.to,
      blockNumber:
        receipt.blockNumber.toString(),
      blockTimestamp:
        block.timestamp.toString(),
      nativeValueWei:
        transaction.value.toString(),
      nativeValueBNB:
        formatEther(transaction.value),
      nonce: transaction.nonce,
      gasUsed:
        receipt.gasUsed.toString(),
      effectiveGasPriceWei:
        receipt.effectiveGasPrice.toString(),
      transactionFeeWei:
        fee.toString(),
      transactionFeeBNB:
        formatEther(fee),
      input: transaction.input,
      selector:
        transaction.input === "0x"
          ? null
          : (transaction.input.slice(
              0,
              10,
            ) as Hex),
    },

    action: decodeTopLevelAction(
      transaction.to,
      transaction.input,
    ),

    tokenTransfers,

    evidence: {
      transactionFetchedFromRpc: true,
      receiptFetchedFromRpc: true,
      blockFetchedFromRpc: true,
      aiUsedForFacts: false,
    },
  };
}
