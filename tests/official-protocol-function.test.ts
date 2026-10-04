import assert from "node:assert/strict";
import test from "node:test";

import {
  encodeFunctionData,
} from "viem";

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
  refineContractWithOfficialProtocolAbi,
} from "../src/chain/official-protocol-function.js";

const ROUTER =
  "0x9Ac64Cc6e4415144C455Bd8E4837Fea55603e5c3";

const WALLET =
  "0x1111111111111111111111111111111111111111";

const TOKEN =
  "0x2222222222222222222222222222222222222222";

const abi = [
  {
    type:
      "function",

    name:
      "swapExactETHForTokens",

    stateMutability:
      "payable",

    inputs: [
      {
        name:
          "amountOutMin",
        type:
          "uint256",
      },

      {
        name:
          "path",
        type:
          "address[]",
      },

      {
        name:
          "to",
        type:
          "address",
      },

      {
        name:
          "deadline",
        type:
          "uint256",
      },
    ],

    outputs: [
      {
        name:
          "amounts",
        type:
          "uint256[]",
      },
    ],
  },
] as const;

const calldata =
  encodeFunctionData({
    abi,

    functionName:
      "swapExactETHForTokens",

    args: [
      1n,
      [
        TOKEN,
        TOKEN,
      ],
      WALLET,
      123n,
    ],
  });

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
        WALLET,

      to:
        ROUTER,

      blockNumber:
        "1",

      blockTimestamp:
        "1",

      nativeValueWei:
        "10000000000000000",

      nativeValueFormatted:
        "0.01",

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
        calldata,

      selector:
        calldata.slice(
          0,
          10
        ) as `0x${string}`,
    },

    action: {
      type:
        "contract_call",

      selector:
        calldata.slice(
          0,
          10
        ) as `0x${string}`,
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
  } satisfies
    UniversalTransactionFacts;

const contract =
  {
    version:
      "bound.contract-intelligence.v1",

    contract: {
      address:
        ROUTER,

      chainId:
        97,

      verified:
        false,

      name:
        null,

      language:
        null,

      match:
        null,

      isProxy:
        false,

      implementations:
        [],
    },

    function: {
      selector:
        facts.transaction.selector,

      name:
        null,

      signature:
        null,

      resolution:
        "signature_database_ambiguous",

      confidence:
        "unknown",

      arguments:
        [],

      alternativeSignatures:
        [],
    },

    evidence: {
      sourcifyChecked:
        true,

      sourcifyVerified:
        false,

      signatureDatabaseChecked:
        true,

      aiUsedForFacts:
        false,
    },
  } satisfies
    ContractIntelligence;

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
        "github.com/pancakeswap/pancake-swap-periphery",

      aiUsedForFacts:
        false,
    },
  } satisfies
    ProtocolIdentity;

test(
  "official PancakeSwap ABI resolves ambiguous selector",
  () => {
    const result =
      refineContractWithOfficialProtocolAbi(
        facts,
        contract,
        protocol
      );

    assert.ok(
      result
    );

    assert.equal(
      result.function.name,
      "swapExactETHForTokens"
    );

    assert.equal(
      result.function.signature,
      "swapExactETHForTokens(uint256,address[],address,uint256)"
    );

    assert.equal(
      result.function.resolution,
      "official_protocol_abi"
    );

    assert.equal(
      result.function.confidence,
      "verified"
    );

    assert.equal(
      result.evidence
        .officialProtocolAbiUsed,
      true
    );
  }
);
