import {
  type Chain,
  type Hash,
} from "viem";

import {
  arbitrum,
  arbitrumSepolia,
  base,
  baseSepolia,
  bsc,
  bscTestnet,
  mainnet,
  optimism,
  optimismSepolia,
  polygon,
  polygonAmoy,
  sepolia,
} from "viem/chains";

import {
  SUPPORTED_EVM_NETWORKS,
  type EvmNetworkDefinition,
  type EvmNetworkId,
} from "./evm-network-registry.js";

export type TransactionNetworkProbe =
  (
    hash: Hash,
    network: EvmNetworkDefinition
  ) => Promise<boolean>;

export type TransactionNetworkDiscoveryResult = {
  hash: Hash;

  status:
    | "FOUND"
    | "AMBIGUOUS"
    | "NOT_FOUND"
    | "INCONCLUSIVE";

  network:
    EvmNetworkDefinition |
    null;

  matches:
    EvmNetworkDefinition[];

  attemptedNetworks:
    number;

  successfulProbes:
    number;

  probeErrors: Array<{
    networkId: EvmNetworkId;
    chainId: number;
    message: string;
  }>;
};

export const NETWORK_CHAINS:
  Record<
    EvmNetworkId,
    Chain
  > = {
    ethereum:
      mainnet,

    "ethereum-sepolia":
      sepolia,

    bsc,

    "bsc-testnet":
      bscTestnet,

    base,

    "base-sepolia":
      baseSepolia,

    arbitrum,

    "arbitrum-sepolia":
      arbitrumSepolia,

    optimism,

    "optimism-sepolia":
      optimismSepolia,

    polygon,

    "polygon-amoy":
      polygonAmoy,
  };

const RPC_TIMEOUT_MS =
  4_500;

type RpcTransactionResponse = {
  result?:
    unknown;

  error?: {
    code?:
      number;

    message?:
      string;
  };
};

function getErrorMessage(
  error: unknown
): string {
  if (
    error instanceof
    Error
  ) {
    return error.message;
  }

  return String(
    error
  );
}

export function getNetworkRpcUrl(
  network:
    EvmNetworkDefinition
): string {
  const genericOverride =
    process.env[
      `BOUND_RPC_${network.chainId}`
    ]
      ?.trim();

  if (
    genericOverride
  ) {
    return genericOverride;
  }

  if (
    network.chainId ===
    97
  ) {
    const bscTestnetOverride =
      process.env
        .BOUND_BSC_TESTNET_RPC
        ?.trim() ??
      process.env
        .BSC_TESTNET_RPC_URL
        ?.trim() ??
      process.env
        .BSC_RPC_URL
        ?.trim();

    if (
      bscTestnetOverride
    ) {
      return bscTestnetOverride;
    }
  }

  const chain =
    NETWORK_CHAINS[
      network.id
    ];

  const rpcUrl =
    chain
      .rpcUrls
      .default
      .http[0];

  if (
    !rpcUrl
  ) {
    throw new Error(
      `No RPC URL configured for ${network.name}.`
    );
  }

  return rpcUrl;
}

export async function probeTransactionHashOnNetwork(
  hash: Hash,
  network:
    EvmNetworkDefinition
): Promise<boolean> {
  const rpcUrl =
    getNetworkRpcUrl(
      network
    );

  const response =
    await fetch(
      rpcUrl,
      {
        method:
          "POST",

        headers: {
          "content-type":
            "application/json",
        },

        signal:
          AbortSignal.timeout(
            RPC_TIMEOUT_MS
          ),

        body:
          JSON.stringify({
            jsonrpc:
              "2.0",

            id:
              1,

            method:
              "eth_getTransactionByHash",

            params: [
              hash,
            ],
          }),
      }
    );

  if (
    !response.ok
  ) {
    throw new Error(
      `${network.name} RPC returned HTTP ${response.status}.`
    );
  }

  const body =
    await response.json() as
      RpcTransactionResponse;

  if (
    body.error
  ) {
    throw new Error(
      body.error.message ??
      `${network.name} RPC returned an error.`
    );
  }

  return (
    body.result !==
      null &&
    body.result !==
      undefined
  );
}

export async function discoverTransactionNetwork(
  hash: Hash,
  options?: {
    probe?:
      TransactionNetworkProbe;

    networks?:
      EvmNetworkDefinition[];
  }
): Promise<
  TransactionNetworkDiscoveryResult
> {
  const networks =
    options?.networks ??
    SUPPORTED_EVM_NETWORKS;

  const probe =
    options?.probe ??
    probeTransactionHashOnNetwork;

  const results =
    await Promise.all(
      networks.map(
        async (
          network
        ) => {
          try {
            const found =
              await probe(
                hash,
                network
              );

            return {
              network,
              found,
              error:
                null,
            };
          } catch (
            error
          ) {
            return {
              network,
              found:
                false,
              error:
                getErrorMessage(
                  error
                ),
            };
          }
        }
      )
    );

  const matches =
    results
      .filter(
        (
          result
        ) =>
          result.found
      )
      .map(
        (
          result
        ) =>
          result.network
      );

  const probeErrors =
    results
      .filter(
        (
          result
        ) =>
          result.error !==
          null
      )
      .map(
        (
          result
        ) => ({
          networkId:
            result.network.id,

          chainId:
            result.network.chainId,

          message:
            result.error ??
            "Unknown RPC error.",
        })
      );

  const successfulProbes =
    results.length -
    probeErrors.length;

  if (
    matches.length ===
    1
  ) {
    return {
      hash,
      status:
        "FOUND",
      network:
        matches[0] ??
        null,
      matches,
      attemptedNetworks:
        networks.length,
      successfulProbes,
      probeErrors,
    };
  }

  if (
    matches.length >
    1
  ) {
    return {
      hash,
      status:
        "AMBIGUOUS",
      network:
        null,
      matches,
      attemptedNetworks:
        networks.length,
      successfulProbes,
      probeErrors,
    };
  }

  if (
    probeErrors.length >
    0
  ) {
    return {
      hash,
      status:
        "INCONCLUSIVE",
      network:
        null,
      matches,
      attemptedNetworks:
        networks.length,
      successfulProbes,
      probeErrors,
    };
  }

  return {
    hash,
    status:
      "NOT_FOUND",
    network:
      null,
    matches,
    attemptedNetworks:
      networks.length,
    successfulProbes,
    probeErrors,
  };
}
