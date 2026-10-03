import type {
  TransactionFacts,
} from "./transaction-intelligence.js";

export type TransactionExplanation = {
  version:
    "bound.transaction-explanation.v1";

  headline:
    string;

  summary:
    string;

  facts: {
    action:
      string;

    status:
      "success" | "reverted";

    network:
      "BNB Smart Chain Testnet";

    asset:
      string | null;

    amount:
      string | null;

    from:
      string;

    transactionTo:
      string | null;

    recipient:
      string | null;

    blockNumber:
      string;

    feeBNB:
      string;
  };

  authority: {
    blockchainFacts:
      "deterministic";

    aiUsed:
      false;

    securityDecision:
      false;
  };
};

function shortAddress(
  value:
    string
): string {
  if (
    value.length <=
    14
  ) {
    return value;
  }

  return (
    value.slice(
      0,
      6
    ) +
    "…" +
    value.slice(
      -4
    )
  );
}

export function buildTransactionExplanation(
  input:
    TransactionFacts
): TransactionExplanation {
  const status =
    input.transaction.status;

  const transfer =
    input.tokenTransfers[0] ??
    null;

  let headline:
    string;

  let summary:
    string;

  let action:
    string;

  let asset:
    string | null =
      null;

  let amount:
    string | null =
      null;

  let recipient:
    string | null =
      null;

  if (
    transfer
  ) {
    recipient =
      transfer.to;
    asset =
      transfer.symbol ??
      shortAddress(
        transfer.token
      );

    amount =
      transfer.amountFormatted ??
      transfer.amountRaw;

    action =
      "token_transfer";

    headline =
      `${amount} ${asset} transferred`;

    summary =
      [
        "This transaction transferred",
        `${amount} ${asset}`,
        "from",
        shortAddress(
          transfer.from
        ),
        "to",
        shortAddress(
          transfer.to
        ),
        "on BNB Smart Chain Testnet.",
        `The transaction ${status === "success" ? "succeeded" : "reverted"}`,
        `in block ${input.transaction.blockNumber}`,
        `and used ${input.transaction.transactionFeeBNB} BNB in transaction fees.`,
      ].join(
        " "
      );
  } else if (
    input.action.type ===
    "native_transfer"
  ) {
    recipient =
      input.transaction.to;

    action =
      "native_transfer";

    asset =
      "BNB";

    amount =
      input.transaction
        .nativeValueBNB;

    headline =
      `${amount} BNB transferred`;

    summary =
      [
        "This transaction transferred",
        `${amount} BNB`,
        "from",
        shortAddress(
          input.transaction.from
        ),
        "to",
        input.transaction.to
          ? shortAddress(
              input.transaction.to
            )
          : "an unknown recipient",
        "on BNB Smart Chain Testnet.",
        `The transaction ${status === "success" ? "succeeded" : "reverted"}`,
        `in block ${input.transaction.blockNumber}.`,
      ].join(
        " "
      );
  } else if (
    input.action.type ===
    "erc20_approve"
  ) {
    action =
      "token_approval";

    headline =
      "Token spending approval";

    summary =
      [
        "This transaction called an ERC-20 approval function.",
        "The spender was",
        shortAddress(
          input.action.spender
        ) + ".",
        `The transaction ${status === "success" ? "succeeded" : "reverted"}`,
        `in block ${input.transaction.blockNumber}.`,
      ].join(
        " "
      );
  } else if (
    input.action.type ===
    "erc20_transfer_from"
  ) {
    recipient =
      input.action.recipient;

    action =
      "token_transfer_from";

    headline =
      "ERC-20 transferFrom call";

    summary =
      [
        "This transaction requested an ERC-20 transferFrom operation",
        "from",
        shortAddress(
          input.action.sender
        ),
        "to",
        shortAddress(
          input.action.recipient
        ) + ".",
        `The transaction ${status === "success" ? "succeeded" : "reverted"}`,
        `in block ${input.transaction.blockNumber}.`,
      ].join(
        " "
      );
  } else if (
    input.action.type ===
    "contract_creation"
  ) {
    action =
      "contract_creation";

    headline =
      "Smart contract created";

    summary =
      [
        "This transaction created a smart contract",
        "on BNB Smart Chain Testnet.",
        `The transaction ${status === "success" ? "succeeded" : "reverted"}`,
        `in block ${input.transaction.blockNumber}.`,
      ].join(
        " "
      );
  } else {
    action =
      "contract_call";

    headline =
      "Smart contract interaction";

    summary =
      [
        "This transaction interacted with a smart contract",
        "on BNB Smart Chain Testnet.",
        `The transaction ${status === "success" ? "succeeded" : "reverted"}`,
        `in block ${input.transaction.blockNumber}.`,
        "BOUND does not infer unknown contract behavior from calldata alone.",
      ].join(
        " "
      );
  }

  return {
    version:
      "bound.transaction-explanation.v1",

    headline,

    summary,

    facts: {
      action,

      status,

      network:
        "BNB Smart Chain Testnet",

      asset,

      amount,

      from:
        input.transaction.from,

      transactionTo:
        input.transaction.to,

      recipient,

      blockNumber:
        input.transaction
          .blockNumber,

      feeBNB:
        input.transaction
          .transactionFeeBNB,
    },

    authority: {
      blockchainFacts:
        "deterministic",

      aiUsed:
        false,

      securityDecision:
        false,
    },
  };
}
