import assert from "node:assert/strict";
import test from "node:test";

import type {
  Address,
} from "viem";

import type {
  UniversalTransactionFacts,
} from "../src/chain/universal-transaction-intelligence.js";

import {
  resolveProtocolIdentity,
} from "../src/chain/protocol-intelligence.js";

function makeFacts(
  overrides?: {
    chainId?:
      number;

    to?:
      Address;

    action?:
      UniversalTransactionFacts["action"];
  }
): UniversalTransactionFacts {
  return {
    version:
      "bound.universal-transaction-facts.v1",

    subject: {
      type:
        "evm_transaction",

      chainId:
        overrides?.chainId ??
        97,

      networkId:
        "bsc-testnet",

      network:
        "BNB Smart Chain Testnet",

      nativeSymbol:
        "BNB",

      transactionHash:
        "0x4185b1cb8dea410022833f66443230ebda0548178a18f10c92b635b44ee37450",

      explorerUrl:
        "https://" +
        "testnet.bscscan.com/tx/0x4185b1cb8dea410022833f66443230ebda0548178a18f10c92b635b44ee37450",
    },

    transaction: {
      status:
        "success",

      from:
        "0x1111111111111111111111111111111111111111",

      to:
        overrides?.to ??
        "0x2222222222222222222222222222222222222222",

      blockNumber:
        "1",

      blockTimestamp:
        "1",

      nativeValueWei:
        "0",

      nativeValueFormatted:
        "0",

      nativeSymbol:
        "BNB",

      nonce:
        1,

      gasUsed:
        "1",

      effectiveGasPriceWei:
        "1",

      transactionFeeWei:
        "1",

      transactionFeeFormatted:
        "0.000000000000000001",

      input:
        "0x12345678",

      selector:
        "0x12345678",
    },

    action:
      overrides?.action ??
      {
        type:
          "contract_call",

        selector:
          "0x12345678",
      },

    tokenTransfers:
      [],

    evidence: {
      networkResolution:
        "explorer_hint",

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

test(
  "identifies PancakeSwap BSC Testnet V2 Router from official registry",
  () => {
    const facts =
      makeFacts({
        to:
          "0x9Ac64Cc6e4415144C455Bd8E4837Fea55603e5c3",
      });

    const result =
      resolveProtocolIdentity(
        facts,
        null
      );

    assert.equal(
      result.status,
      "identified"
    );

    assert.equal(
      result.name,
      "PancakeSwap"
    );

    assert.equal(
      result.category,
      "dex"
    );

    assert.equal(
      result.component,
      "V2 Router"
    );

    assert.equal(
      result.confidence,
      "verified"
    );

    assert.equal(
      result.evidence.method,
      "official_registry"
    );
  }
);

test(
  "does not apply a protocol address to the wrong chain",
  () => {
    const facts =
      makeFacts({
        chainId:
          56,

        to:
          "0x9Ac64Cc6e4415144C455Bd8E4837Fea55603e5c3",
      });

    const result =
      resolveProtocolIdentity(
        facts,
        null
      );

    assert.equal(
      result.status,
      "unknown"
    );

    assert.equal(
      result.name,
      null
    );
  }
);

test(
  "does not invent a dApp for direct token transfer",
  () => {
    const facts =
      makeFacts({
        to:
          "0x337610d27c682e347c9cd60bd4b3b107c9d34ddd",

        action: {
          type:
            "erc20_transfer",

          recipient:
            "0x32438dE3179DF205c63e8793A20BA6885762f537",

          amountRaw:
            "1000000000000000",
        },
      });

    const result =
      resolveProtocolIdentity(
        facts,
        null
      );

    assert.equal(
      result.status,
      "none_identified"
    );

    assert.equal(
      result.name,
      null
    );

    assert.equal(
      result.evidence.method,
      "direct_token_call"
    );
  }
);

test(
  "official protocol evidence exposes a plain source URL",
  () => {
    const facts =
      makeFacts({
        to:
          "0x9Ac64Cc6e4415144C455Bd8E4837Fea55603e5c3",
      });

    const result =
      resolveProtocolIdentity(
        facts,
        null
      );

    assert.equal(
      result.status,
      "identified"
    );

    assert.ok(
      result.evidence.sourceUrl
    );

    assert.match(
      result.evidence.sourceUrl,
      /^https:\/\//
    );

    assert.equal(
      result.evidence.sourceUrl.includes(
        "]("
      ),
      false
    );
  }
);
