import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTransactionExplanation,
} from "../src/chain/transaction-explanation.js";

import type {
  TransactionFacts,
} from "../src/chain/transaction-intelligence.js";

const facts:
  TransactionFacts = {
  version:
    "bound.transaction-facts.v1",

  subject: {
    type:
      "evm_transaction",

    chainId:
      97,

    network:
      "bsc-testnet",

    transactionHash:
      "0x1111111111111111111111111111111111111111111111111111111111111111",

    explorerUrl:
      "https://" +
      "testnet.bscscan.com/tx/" +
      "0x1111111111111111111111111111111111111111111111111111111111111111",
  },

  transaction: {
    status:
      "success",

    from:
      "0x6fa2f4360a04c88d98f6a70d1dda9653d856ce90",

    to:
      "0x337610d27c682e347c9cd60bd4b3b107c9d34ddd",

    blockNumber:
      "134599495",

    blockTimestamp:
      "1791016730",

    nativeValueWei:
      "0",

    nativeValueBNB:
      "0",

    nonce:
      6,

    gasUsed:
      "34503",

    effectiveGasPriceWei:
      "100000000",

    transactionFeeWei:
      "3450300000000",

    transactionFeeBNB:
      "0.0000034503",

    input:
      "0xa9059cbb",

    selector:
      "0xa9059cbb",
  },

  action: {
    type:
      "erc20_transfer",

    recipient:
      "0x32438dE3179DF205c63e8793A20BA6885762f537",

    amountRaw:
      "1000000000000000",
  },

  tokenTransfers: [
    {
      token:
        "0x337610d27c682e347c9cd60bd4b3b107c9d34ddd",

      symbol:
        "USDT",

      decimals:
        18,

      from:
        "0x6fa2f4360a04c88d98f6a70d1dda9653d856ce90",

      to:
        "0x32438de3179df205c63e8793a20ba6885762f537",

      amountRaw:
        "1000000000000000",

      amountFormatted:
        "0.001",
    },
  ],

  evidence: {
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

test(
  "explains deterministic token transfer",
  () => {
    const result =
      buildTransactionExplanation(
        facts
      );

    assert.equal(
      result.headline,
      "0.001 USDT transferred"
    );

    assert.equal(
      result.facts.amount,
      "0.001"
    );

    assert.equal(
      result.facts.asset,
      "USDT"
    );

    assert.equal(
      result.facts.recipient,
      "0x32438de3179df205c63e8793a20ba6885762f537"
    );

    assert.equal(
      result.facts.transactionTo,
      "0x337610d27c682e347c9cd60bd4b3b107c9d34ddd"
    );

    assert.equal(
      result.authority.aiUsed,
      false
    );

    assert.equal(
      result.authority.securityDecision,
      false
    );
  }
);

test(
  "does not label transaction safe",
  () => {
    const result =
      buildTransactionExplanation(
        facts
      );

    const serialized =
      JSON.stringify(
        result
      ).toLowerCase();

    assert.equal(
      serialized.includes(
        '"safe"'
      ),
      false
    );
  }
);
