import assert from "node:assert/strict";
import test from "node:test";

import type {
  UniversalTransactionFacts,
} from "../src/chain/universal-transaction-intelligence.js";

import type {
  ContractIntelligence,
} from "../src/chain/contract-intelligence.js";

import type {
  ProtocolIdentity,
} from "../src/chain/protocol-intelligence.js";

import {
  resolveSwapIntelligence,
} from "../src/chain/swap-intelligence.js";

const WALLET =
  "0x1111111111111111111111111111111111111111";

const ROUTER =
  "0x9Ac64Cc6e4415144C455Bd8E4837Fea55603e5c3";

const TOKEN_A =
  "0x2222222222222222222222222222222222222222";

const TOKEN_B =
  "0x3333333333333333333333333333333333333333";

const PAIR =
  "0x4444444444444444444444444444444444444444";

function makeFacts(
  options?: {
    nativeValueWei?:
      string;

    nativeValueFormatted?:
      string;

    tokenTransfers?:
      UniversalTransactionFacts["tokenTransfers"];

    to?:
      `0x${string}`;
  }
): UniversalTransactionFacts {
  return {
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
        WALLET,

      to:
        options?.to ??
        ROUTER,

      blockNumber:
        "1",

      blockTimestamp:
        "1",

      nativeValueWei:
        options
          ?.nativeValueWei ??
        "0",

      nativeValueFormatted:
        options
          ?.nativeValueFormatted ??
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

    action: {
      type:
        "contract_call",

      selector:
        "0x12345678",
    },

    tokenTransfers:
      options
        ?.tokenTransfers ??
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

const protocol =
  {
    version:
      "bound.protocol-intelligence.v1",

    status:
      "identified",

    name:
      "PancakeSwap",

    category:
      "dex",

    component:
      "V2 Router",

    confidence:
      "verified",

    address:
      ROUTER,

    reason:
      "Official registry",

    evidence: {
      method:
        "official_registry",

      sourceName:
        "PancakeSwap official repository",

      sourceUrl:
        "https://" +
        "example.com",

      aiUsedForFacts:
        false,
    },
  } satisfies
    ProtocolIdentity;

function makeContract(
  functionName:
    string
): ContractIntelligence {
  return {
    version:
      "bound.contract-intelligence.v1",

    contract: {
      address:
        ROUTER,

      chainId:
        97,

      verified:
        true,

      name:
        "PancakeRouter",

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
        "0x12345678",

      name:
        functionName,

      signature:
        `${functionName}(...)`,

      resolution:
        "verified_abi",

      confidence:
        "verified",

      arguments:
        [],

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
  };
}

test(
  "identifies native to token swap",
  () => {
    const facts =
      makeFacts({
        nativeValueWei:
          "10000000000000000",

        nativeValueFormatted:
          "0.01",

        tokenTransfers: [
          {
            token:
              TOKEN_B,

            symbol:
              "USDT",

            decimals:
              18,

            from:
              PAIR,

            to:
              WALLET,

            amountRaw:
              "2500000000000000000",

            amountFormatted:
              "2.5",
          },
        ],
      });

    const result =
      resolveSwapIntelligence(
        facts,
        makeContract(
          "swapExactETHForTokens"
        ),
        protocol
      );

    assert.equal(
      result.status,
      "identified"
    );

    assert.equal(
      result.kind,
      "native_to_token"
    );

    assert.equal(
      result.sent
        ?.amountFormatted,
      "0.01"
    );

    assert.equal(
      result.received
        ?.amountFormatted,
      "2.5"
    );

    assert.match(
      result.summary ??
      "",
      /swapped 0\.01 BNB for 2\.5 USDT through PancakeSwap/i
    );
  }
);

test(
  "identifies token to token swap",
  () => {
    const facts =
      makeFacts({
        tokenTransfers: [
          {
            token:
              TOKEN_A,

            symbol:
              "CAKE",

            decimals:
              18,

            from:
              WALLET,

            to:
              PAIR,

            amountRaw:
              "1000000000000000000",

            amountFormatted:
              "1",
          },
          {
            token:
              TOKEN_B,

            symbol:
              "USDT",

            decimals:
              18,

            from:
              PAIR,

            to:
              WALLET,

            amountRaw:
              "3000000000000000000",

            amountFormatted:
              "3",
          },
        ],
      });

    const result =
      resolveSwapIntelligence(
        facts,
        makeContract(
          "swapExactTokensForTokens"
        ),
        protocol
      );

    assert.equal(
      result.status,
      "identified"
    );

    assert.equal(
      result.kind,
      "token_to_token"
    );

    assert.match(
      result.summary ??
      "",
      /swapped 1 CAKE for 3 USDT through PancakeSwap/i
    );
  }
);

test(
  "does not call non swap DEX function a swap",
  () => {
    const facts =
      makeFacts();

    const result =
      resolveSwapIntelligence(
        facts,
        makeContract(
          "addLiquidity"
        ),
        protocol
      );

    assert.equal(
      result.status,
      "not_swap"
    );

    assert.equal(
      result.kind,
      null
    );
  }
);

test(
  "does not classify a direct token transfer as swap",
  () => {
    const directProtocol =
      {
        ...protocol,

        status:
          "none_identified",

        name:
          null,

        category:
          null,

        component:
          null,

        confidence:
          "evidence_based",

        evidence: {
          ...protocol.evidence,

          method:
            "direct_token_call",
        },
      } satisfies
        ProtocolIdentity;

    const result =
      resolveSwapIntelligence(
        makeFacts({
          to:
            TOKEN_A,
        }),
        null,
        directProtocol
      );

    assert.equal(
      result.status,
      "not_swap"
    );
  }
);
