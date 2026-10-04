export type EvmNetworkId =
  | "ethereum"
  | "ethereum-sepolia"
  | "bsc"
  | "bsc-testnet"
  | "base"
  | "base-sepolia"
  | "arbitrum"
  | "arbitrum-sepolia"
  | "optimism"
  | "optimism-sepolia"
  | "polygon"
  | "polygon-amoy";

export type EvmNetworkDefinition = {
  id: EvmNetworkId;
  name: string;
  chainId: number;
  nativeSymbol: string;
  explorerHosts: string[];
  explorerBaseUrl: string;
};

export const SUPPORTED_EVM_NETWORKS:
  EvmNetworkDefinition[] = [
    {
      id: "ethereum",
      name: "Ethereum",
      chainId: 1,
      nativeSymbol: "ETH",
      explorerHosts: [
        "etherscan.io",
      ],
      explorerBaseUrl:
        "https://" +
        "etherscan.io",
    },
    {
      id: "ethereum-sepolia",
      name: "Ethereum Sepolia",
      chainId: 11155111,
      nativeSymbol: "ETH",
      explorerHosts: [
        "sepolia.etherscan.io",
      ],
      explorerBaseUrl:
        "https://" +
        "sepolia.etherscan.io",
    },
    {
      id: "bsc",
      name: "BNB Smart Chain",
      chainId: 56,
      nativeSymbol: "BNB",
      explorerHosts: [
        "bscscan.com",
      ],
      explorerBaseUrl:
        "https://" +
        "bscscan.com",
    },
    {
      id: "bsc-testnet",
      name: "BNB Smart Chain Testnet",
      chainId: 97,
      nativeSymbol: "BNB",
      explorerHosts: [
        "testnet.bscscan.com",
      ],
      explorerBaseUrl:
        "https://" +
        "testnet.bscscan.com",
    },
    {
      id: "base",
      name: "Base",
      chainId: 8453,
      nativeSymbol: "ETH",
      explorerHosts: [
        "basescan.org",
      ],
      explorerBaseUrl:
        "https://" +
        "basescan.org",
    },
    {
      id: "base-sepolia",
      name: "Base Sepolia",
      chainId: 84532,
      nativeSymbol: "ETH",
      explorerHosts: [
        "sepolia.basescan.org",
      ],
      explorerBaseUrl:
        "https://" +
        "sepolia.basescan.org",
    },
    {
      id: "arbitrum",
      name: "Arbitrum One",
      chainId: 42161,
      nativeSymbol: "ETH",
      explorerHosts: [
        "arbiscan.io",
      ],
      explorerBaseUrl:
        "https://" +
        "arbiscan.io",
    },
    {
      id: "arbitrum-sepolia",
      name: "Arbitrum Sepolia",
      chainId: 421614,
      nativeSymbol: "ETH",
      explorerHosts: [
        "sepolia.arbiscan.io",
      ],
      explorerBaseUrl:
        "https://" +
        "sepolia.arbiscan.io",
    },
    {
      id: "optimism",
      name: "OP Mainnet",
      chainId: 10,
      nativeSymbol: "ETH",
      explorerHosts: [
        "optimistic.etherscan.io",
      ],
      explorerBaseUrl:
        "https://" +
        "optimistic.etherscan.io",
    },
    {
      id: "optimism-sepolia",
      name: "OP Sepolia",
      chainId: 11155420,
      nativeSymbol: "ETH",
      explorerHosts: [
        "sepolia-optimism.etherscan.io",
      ],
      explorerBaseUrl:
        "https://" +
        "sepolia-optimism.etherscan.io",
    },
    {
      id: "polygon",
      name: "Polygon",
      chainId: 137,
      nativeSymbol: "POL",
      explorerHosts: [
        "polygonscan.com",
      ],
      explorerBaseUrl:
        "https://" +
        "polygonscan.com",
    },
    {
      id: "polygon-amoy",
      name: "Polygon Amoy",
      chainId: 80002,
      nativeSymbol: "POL",
      explorerHosts: [
        "amoy.polygonscan.com",
      ],
      explorerBaseUrl:
        "https://" +
        "amoy.polygonscan.com",
    },
  ];

function normalizeHost(
  hostname: string
): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(
      /^www\./,
      ""
    );
}

export function getEvmNetworkByExplorerHost(
  hostname: string
): EvmNetworkDefinition | null {
  const normalized =
    normalizeHost(
      hostname
    );

  return (
    SUPPORTED_EVM_NETWORKS.find(
      (
        network
      ) =>
        network.explorerHosts
          .some(
            (
              host
            ) =>
              normalizeHost(
                host
              ) ===
              normalized
          )
    ) ??
    null
  );
}

export function getEvmNetworkByChainId(
  chainId: number
): EvmNetworkDefinition | null {
  return (
    SUPPORTED_EVM_NETWORKS.find(
      (
        network
      ) =>
        network.chainId ===
        chainId
    ) ??
    null
  );
}
