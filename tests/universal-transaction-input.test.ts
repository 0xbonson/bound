import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeUniversalTransactionInput,
} from "../src/chain/universal-transaction-input.js";

const HASH =
  "0x4185b1cb8dea410022833f66443230ebda0548178a18f10c92b635b44ee37450";

test(
  "accepts raw EVM hash without assuming a chain",
  () => {
    const result =
      normalizeUniversalTransactionInput(
        HASH
      );

    assert.equal(
      result.hash,
      HASH
    );

    assert.equal(
      result.source,
      "transaction_hash"
    );

    assert.equal(
      result.networkHint,
      null
    );
  }
);

const explorerCases = [
  [
    "https://" +
      "etherscan.io/tx/" +
      HASH,
    1,
  ],
  [
    "https://" +
      "sepolia.etherscan.io/tx/" +
      HASH,
    11155111,
  ],
  [
    "https://" +
      "bscscan.com/tx/" +
      HASH,
    56,
  ],
  [
    "https://" +
      "testnet.bscscan.com/tx/" +
      HASH,
    97,
  ],
  [
    "https://" +
      "basescan.org/tx/" +
      HASH,
    8453,
  ],
  [
    "https://" +
      "sepolia.basescan.org/tx/" +
      HASH,
    84532,
  ],
  [
    "https://" +
      "arbiscan.io/tx/" +
      HASH,
    42161,
  ],
  [
    "https://" +
      "optimistic.etherscan.io/tx/" +
      HASH,
    10,
  ],
  [
    "https://" +
      "polygonscan.com/tx/" +
      HASH,
    137,
  ],
] as const;

for (
  const [
    url,
    chainId,
  ]
  of explorerCases
) {
  test(
    `recognizes explorer chain ${chainId}`,
    () => {
      const result =
        normalizeUniversalTransactionInput(
          url
        );

      assert.equal(
        result.hash,
        HASH
      );

      assert.equal(
        result.source,
        "explorer_url"
      );

      assert.equal(
        result.networkHint
          ?.chainId,
        chainId
      );
    }
  );
}

test(
  "extracts hash from unknown explorer without inventing a chain",
  () => {
    const result =
      normalizeUniversalTransactionInput(
        "https://" +
        "example-explorer.xyz/tx/" +
        HASH
      );

    assert.equal(
      result.hash,
      HASH
    );

    assert.equal(
      result.networkHint,
      null
    );

    assert.equal(
      result.explorerHost,
      "example-explorer.xyz"
    );
  }
);

test(
  "rejects non-transaction explorer URL",
  () => {
    assert.throws(
      () =>
        normalizeUniversalTransactionInput(
          "https://" +
          "etherscan.io/address/" +
          HASH
        ),
      /does not point to a transaction/
    );
  }
);

test(
  "rejects malformed hash",
  () => {
    assert.throws(
      () =>
        normalizeUniversalTransactionInput(
          "0x1234"
        )
    );
  }
);
