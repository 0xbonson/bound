import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeTransactionInput,
} from "../src/chain/transaction-intelligence.js";

const HASH =
  "0x1111111111111111111111111111111111111111111111111111111111111111";

test(
  "accepts raw transaction hash",
  () => {
    const result =
      normalizeTransactionInput(HASH);

    assert.equal(result.hash, HASH);
    assert.equal(
      result.source,
      "transaction_hash",
    );
  },
);

test(
  "accepts BSC Testnet BscScan URL",
  () => {
    const url =
      "https://" +
      "testnet.bscscan.com/tx/" +
      HASH;

    const result =
      normalizeTransactionInput(url);

    assert.equal(result.hash, HASH);
    assert.equal(
      result.source,
      "bscscan_url",
    );
  },
);

test(
  "rejects BSC mainnet URL",
  () => {
    const url =
      "https://" +
      "bscscan.com/tx/" +
      HASH;

    assert.throws(
      () =>
        normalizeTransactionInput(url),
      /BSC Testnet/i,
    );
  },
);

test(
  "rejects malformed input",
  () => {
    assert.throws(
      () =>
        normalizeTransactionInput(
          "not-a-transaction",
        ),
      /valid BSC Testnet/i,
    );
  },
);
