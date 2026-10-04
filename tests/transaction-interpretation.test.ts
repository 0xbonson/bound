import assert from "node:assert/strict";
import test from "node:test";

import type {
  UniversalTransactionFacts,
} from "../src/chain/universal-transaction-intelligence.js";

import type {
  ContractIntelligence,
} from "../src/chain/contract-intelligence.js";

import {
  interpretTransaction,
} from "../src/chain/transaction-interpretation.js";

const facts =
  {
    version:
      "bound.universal-transaction-facts.v1",

    subject: {
      type:
        "evm_transaction",

      chainId:
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
        "0x6fa2f4360a04c88d98f6a70d1dda9653d856ce90",

      to:
        "0x337610d27c682e347c9cd60bd4b3b107c9d34ddd",

      blockNumber:
        "134599495",

      blockTimestamp:
        "0",

      nativeValueWei:
        "0",

      nativeValueFormatted:
        "0",

      nativeSymbol:
        "BNB",

      nonce:
        1,

      gasUsed:
        "0",

      effectiveGasPriceWei:
        "0",

      transactionFeeWei:
        "3450300000000",

      transactionFeeFormatted:
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
          "0x32438dE3179DF205c63e8793A20BA6885762f537",

        amountRaw:
          "1000000000000000",

        amountFormatted:
          "0.001",
      },
    ],

    evidence: {
      networkResolution:
        "cross_network_discovery",

      transactionFetchedFromRpc:
        true,

      receiptFetchedFromRpc:
        true,

      blockFetchedFromRpc:
        true,

      aiUsedForFacts:
        false,
    },
  } satisfies
    UniversalTransactionFacts;

const contract =
  {
    version:
      "bound.contract-intelligence.v1",

    contract: {
      address:
        "0x337610d27c682e347c9cd60bd4b3b107c9d34ddd",

      chainId:
        97,

      verified:
        true,

      name:
        "BEP40Token",

      language:
        "Solidity",

      match:
        "match",

      isProxy:
        false,

      implementations:
        [],
    },

    function: {
      selector:
        "0xa9059cbb",

      name:
        "transfer",

      signature:
        "transfer(address,uint256)",

      resolution:
        "verified_abi",

      confidence:
        "verified",

      arguments:
        [
          {
            name:
              "recipient",

            type:
              "address",

            value:
              "0x32438dE3179DF205c63e8793A20BA6885762f537",
          },
          {
            name:
              "amount",

            type:
              "uint256",

            value:
              "1000000000000000",
          },
        ],

      alternativeSignatures:
        [],
    },

    evidence: {
      sourcifyChecked:
        true,

      sourcifyVerified:
        true,

      signatureDatabaseChecked:
        false,

      aiUsedForFacts:
        false,
    },
  } satisfies
    ContractIntelligence;

test(
  "builds beginner-readable deterministic transfer interpretation",
  () => {
    const result =
      interpretTransaction(
        facts,
        contract
      );

    assert.equal(
      result.headline,
      "0.001 USDT sent"
    );

    assert.equal(
      result.interaction.type,
      "token_transfer"
    );

    assert.equal(
      result.interaction.functionSignature,
      "transfer(address,uint256)"
    );

    assert.equal(
      result.interaction.functionConfidence,
      "verified"
    );

    assert.match(
      result.plainEnglish,
      /You sent 0\.001 USDT/
    );
  }
);

test(
  "calculates observed wallet token effect",
  () => {
    const result =
      interpretTransaction(
        facts,
        contract
      );

    assert.equal(
      result.observedWalletEffect
        .tokenEffects[0]
        ?.direction,
      "out"
    );

    assert.equal(
      result.observedWalletEffect
        .tokenEffects[0]
        ?.amountFormatted,
      "0.001"
    );
  }
);

test(
  "does not invent a protocol for a direct token call",
  () => {
    const result =
      interpretTransaction(
        facts,
        contract
      );

    assert.equal(
      result.protocol.status,
      "none_identified"
    );

    assert.equal(
      result.protocol.name,
      null
    );

    assert.match(
      result.protocol.reason,
      /directly called a token contract/i
    );
  }
);

test(
  "surfaces verified PancakeSwap identity in final interpretation",
  () => {
    const pancakeFacts =
      {
        ...facts,

        transaction: {
          ...facts.transaction,

          to:
            "0x9Ac64Cc6e4415144C455Bd8E4837Fea55603e5c3",

          input:
            "0x12345678",

          selector:
            "0x12345678",
        },

        action: {
          type:
            "contract_call",

          selector:
            "0x12345678",
        },

        tokenTransfers:
          [],
      } satisfies
        UniversalTransactionFacts;

    const result =
      interpretTransaction(
        pancakeFacts,
        null
      );

    assert.equal(
      result.protocol.status,
      "identified"
    );

    assert.equal(
      result.protocol.name,
      "PancakeSwap"
    );

    assert.equal(
      result.protocol.category,
      "dex"
    );

    assert.equal(
      result.protocol.component,
      "V2 Router"
    );

    assert.equal(
      result.protocol.confidence,
      "verified"
    );

    assert.equal(
      result.protocol.evidence.method,
      "official_registry"
    );
  }
);

test(
  "surfaces verified PancakeSwap swap in final interpretation",
  () => {
    const router =
      "0x9Ac64Cc6e4415144C455Bd8E4837Fea55603e5c3";

    const wallet =
      facts.transaction.from;

    const swapFacts =
      {
        ...facts,

        transaction: {
          ...facts.transaction,

          to:
            router,

          nativeValueWei:
            "10000000000000000",

          nativeValueFormatted:
            "0.01",

          input:
            "0x12345678",

          selector:
            "0x12345678",
        },

        action: {
          type:
            "contract_call",

          selector:
            "0x12345678",
        },

        tokenTransfers: [
          {
            token:
              "0x5555555555555555555555555555555555555555",

            symbol:
              "USDT",

            decimals:
              18,

            from:
              "0x4444444444444444444444444444444444444444",

            to:
              wallet,

            amountRaw:
              "2500000000000000000",

            amountFormatted:
              "2.5",
          },
        ],
      } satisfies
        UniversalTransactionFacts;

    const swapContract =
      {
        ...contract,

        contract: {
          ...contract.contract,

          address:
            router,

          name:
            "PancakeRouter",
        },

        function: {
          ...contract.function,

          selector:
            "0x12345678",

          name:
            "swapExactETHForTokens",

          signature:
            "swapExactETHForTokens(...)",

          resolution:
            "verified_abi",

          confidence:
            "verified",

          arguments:
            [],

          alternativeSignatures:
            [],
        },
      } satisfies
        ContractIntelligence;

    const result =
      interpretTransaction(
        swapFacts,
        swapContract
      );

    assert.equal(
      result.protocol.name,
      "PancakeSwap"
    );

    assert.equal(
      result.swap.status,
      "identified"
    );

    assert.equal(
      result.swap.kind,
      "native_to_token"
    );

    assert.equal(
      result.swap.sent
        ?.amountFormatted,
      "0.01"
    );

    assert.equal(
      result.swap.received
        ?.amountFormatted,
      "2.5"
    );

    assert.equal(
      result.headline,
      "Swap via PancakeSwap"
    );

    assert.match(
      result.plainEnglish,
      /swapped 0\.01 BNB for 2\.5 USDT through PancakeSwap/i
    );
  }
);

test(
  "keeps direct token transfer explicitly non-swap",
  () => {
    const result =
      interpretTransaction(
        facts,
        contract
      );

    assert.equal(
      result.swap.status,
      "not_swap"
    );

    assert.equal(
      result.protocol.name,
      null
    );

    assert.equal(
      result.headline,
      "0.001 USDT sent"
    );
  }
);
