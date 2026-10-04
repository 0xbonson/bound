import assert from "node:assert/strict";
import test from "node:test";

import {
  type Hash,
} from "viem";

import {
  SUPPORTED_EVM_NETWORKS,
} from "../src/chain/evm-network-registry.js";

import {
  discoverTransactionNetwork,
} from "../src/chain/transaction-network-discovery.js";

const HASH =
  "0x4185b1cb8dea410022833f66443230ebda0548178a18f10c92b635b44ee37450" as Hash;

const ethereum =
  SUPPORTED_EVM_NETWORKS.find(
    (
      network
    ) =>
      network.chainId ===
      1
  );

const bscTestnet =
  SUPPORTED_EVM_NETWORKS.find(
    (
      network
    ) =>
      network.chainId ===
      97
  );

assert.ok(
  ethereum
);

assert.ok(
  bscTestnet
);

test(
  "detects exactly one matching network",
  async () => {
    const result =
      await discoverTransactionNetwork(
        HASH,
        {
          networks: [
            ethereum,
            bscTestnet,
          ],

          probe:
            async (
              _hash,
              network
            ) =>
              network.chainId ===
              97,
        }
      );

    assert.equal(
      result.status,
      "FOUND"
    );

    assert.equal(
      result.network
        ?.chainId,
      97
    );

    assert.equal(
      result.matches.length,
      1
    );
  }
);

test(
  "does not guess when hash exists on multiple networks",
  async () => {
    const result =
      await discoverTransactionNetwork(
        HASH,
        {
          networks: [
            ethereum,
            bscTestnet,
          ],

          probe:
            async () =>
              true,
        }
      );

    assert.equal(
      result.status,
      "AMBIGUOUS"
    );

    assert.equal(
      result.network,
      null
    );

    assert.equal(
      result.matches.length,
      2
    );
  }
);

test(
  "returns not found when every network was checked successfully",
  async () => {
    const result =
      await discoverTransactionNetwork(
        HASH,
        {
          networks: [
            ethereum,
            bscTestnet,
          ],

          probe:
            async () =>
              false,
        }
      );

    assert.equal(
      result.status,
      "NOT_FOUND"
    );

    assert.equal(
      result.network,
      null
    );

    assert.equal(
      result.probeErrors.length,
      0
    );
  }
);

test(
  "returns inconclusive instead of pretending missing RPCs were checked",
  async () => {
    const result =
      await discoverTransactionNetwork(
        HASH,
        {
          networks: [
            ethereum,
            bscTestnet,
          ],

          probe:
            async (
              _hash,
              network
            ) => {
              if (
                network.chainId ===
                1
              ) {
                throw new Error(
                  "RPC unavailable"
                );
              }

              return false;
            },
        }
      );

    assert.equal(
      result.status,
      "INCONCLUSIVE"
    );

    assert.equal(
      result.network,
      null
    );

    assert.equal(
      result.successfulProbes,
      1
    );

    assert.equal(
      result.probeErrors.length,
      1
    );
  }
);

test(
  "a real match still wins even when another RPC fails",
  async () => {
    const result =
      await discoverTransactionNetwork(
        HASH,
        {
          networks: [
            ethereum,
            bscTestnet,
          ],

          probe:
            async (
              _hash,
              network
            ) => {
              if (
                network.chainId ===
                1
              ) {
                throw new Error(
                  "RPC unavailable"
                );
              }

              return (
                network.chainId ===
                97
              );
            },
        }
      );

    assert.equal(
      result.status,
      "FOUND"
    );

    assert.equal(
      result.network
        ?.chainId,
      97
    );

    assert.equal(
      result.probeErrors.length,
      1
    );
  }
);
