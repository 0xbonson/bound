import {
  decodeFunctionData,
  parseAbi,
  type Abi,
  type AbiFunction,
  type Address,
} from "viem";

import type {
  UniversalTransactionFacts,
} from "./universal-transaction-intelligence.js";

import type {
  ContractIntelligence,
} from "./contract-intelligence.js";

import type {
  ProtocolIdentity,
} from "./protocol-intelligence.js";

const PANCAKESWAP_V2_ROUTER_ABI =
  parseAbi([
    "function swapExactTokensForTokens(uint256 amountIn,uint256 amountOutMin,address[] path,address to,uint256 deadline) returns (uint256[] amounts)",
    "function swapTokensForExactTokens(uint256 amountOut,uint256 amountInMax,address[] path,address to,uint256 deadline) returns (uint256[] amounts)",
    "function swapExactETHForTokens(uint256 amountOutMin,address[] path,address to,uint256 deadline) payable returns (uint256[] amounts)",
    "function swapTokensForExactETH(uint256 amountOut,uint256 amountInMax,address[] path,address to,uint256 deadline) returns (uint256[] amounts)",
    "function swapExactTokensForETH(uint256 amountIn,uint256 amountOutMin,address[] path,address to,uint256 deadline) returns (uint256[] amounts)",
    "function swapETHForExactTokens(uint256 amountOut,address[] path,address to,uint256 deadline) payable returns (uint256[] amounts)",
    "function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256 amountIn,uint256 amountOutMin,address[] path,address to,uint256 deadline)",
    "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin,address[] path,address to,uint256 deadline) payable",
    "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amountIn,uint256 amountOutMin,address[] path,address to,uint256 deadline)",
  ]);

type OfficialAbiEntry = {
  chainId:
    number;

  address:
    Address;

  protocol:
    string;

  component:
    string;

  abi:
    Abi;

  sourceName:
    string;

  sourceUrl:
    string;
};

const OFFICIAL_ABIS:
  OfficialAbiEntry[] = [
    {
      chainId:
        97,

      address:
        "0x9Ac64Cc6e4415144C455Bd8E4837Fea55603e5c3",

      protocol:
        "PancakeSwap",

      component:
        "V2 Router",

      abi:
        PANCAKESWAP_V2_ROUTER_ABI,

      sourceName:
        "PancakeSwap official router interfaces",

      sourceUrl:
        "https://" +
        "github.com/pancakeswap/pancake-swap-periphery/tree/master/contracts/interfaces",
    },
  ];

function sameAddress(
  left:
    Address,

  right:
    Address
): boolean {
  return (
    left.toLowerCase() ===
    right.toLowerCase()
  );
}

function normalizeValue(
  value:
    unknown
): unknown {
  if (
    typeof value ===
    "bigint"
  ) {
    return value.toString();
  }

  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      normalizeValue
    );
  }

  return value;
}

function signatureFor(
  item:
    AbiFunction
): string {
  return (
    item.name +
    "(" +
    item.inputs
      .map(
        input =>
          input.type
      )
      .join(
        ","
      ) +
    ")"
  );
}

export function refineContractWithOfficialProtocolAbi(
  facts:
    UniversalTransactionFacts,

  contract:
    ContractIntelligence |
    null,

  protocol:
    ProtocolIdentity
): ContractIntelligence |
   null {
  if (
    !contract ||
    !facts.transaction.to ||
    protocol.status !==
      "identified" ||
    protocol.confidence !==
      "verified" ||
    !protocol.name ||
    !protocol.component
  ) {
    return contract;
  }

  const entry =
    OFFICIAL_ABIS.find(
      candidate =>
        candidate.chainId ===
          facts.subject.chainId &&
        sameAddress(
          candidate.address,
          facts.transaction.to!
        ) &&
        candidate.protocol ===
          protocol.name &&
        candidate.component ===
          protocol.component
    );

  if (
    !entry
  ) {
    return contract;
  }

  try {
    const decoded =
      decodeFunctionData({
        abi:
          entry.abi,

        data:
          facts.transaction.input,
      });

    const functionItem =
      entry.abi.find(
        (
          item
        ): item is
          AbiFunction =>
          item.type ===
            "function" &&
          item.name ===
            decoded.functionName
      );

    if (
      !functionItem
    ) {
      return contract;
    }

    const decodedArgs =
      (
        decoded.args ??
        []
      ) as readonly unknown[];

    const argumentsList =
      functionItem.inputs.map(
        (
          input,
          index
        ) => ({
          name:
            input.name ||
            `arg${index}`,

          type:
            input.type,

          value:
            normalizeValue(
              decodedArgs[
                index
              ]
            ),
        })
      );

    return {
      ...contract,

      function: {
        selector:
          facts.transaction
            .selector,

        name:
          functionItem.name,

        signature:
          signatureFor(
            functionItem
          ),

        resolution:
          "official_protocol_abi",

        confidence:
          "verified",

        arguments:
          argumentsList,

        alternativeSignatures:
          contract.function
            .alternativeSignatures,
      },

      evidence: {
        ...contract.evidence,

        officialProtocolAbiUsed:
          true,

        officialProtocolSourceName:
          entry.sourceName,

        officialProtocolSourceUrl:
          entry.sourceUrl,
      },
    };
  } catch {
    return contract;
  }
}
