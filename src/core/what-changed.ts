import type {
  TransactionAnalysisIntentManifest,
} from "./intent-manifest.js";

import type {
  MppPaymentChallenge,
} from "./mpp-request-bound.js";

import {
  getToolRequestHash,
  type JsonValue,
  type ToolRequest,
} from "./request-bound.js";

export const WHAT_CHANGED_VERSION =
  "bound.what-changed.v1" as const;

export type ChangeStatus =
  | "SAME"
  | "CHANGED"
  | "WITHIN_AUTHORIZATION";

export type GuardDecision =
  | "ALLOW"
  | "BLOCK"
  | "NEEDS_REAUTHORIZATION";

export type WhatChangedReport = {
  version:
    typeof WHAT_CHANGED_VERSION;

  decision:
    GuardDecision;

  comparison: {
    transaction:
      ChangeStatus;

    analysisTool:
      ChangeStatus;

    network:
      ChangeStatus;

    price:
      ChangeStatus;

    token:
      ChangeStatus;

    merchant:
      ChangeStatus;

    request:
      ChangeStatus;
  };

  authorized: {
    transactionHash:
      string;

    requestHash:
      `0x${string}`;

    toolId:
      string;

    method:
      string;

    chainId:
      number;

    maxAmountRaw:
      string;

    paymentToken:
      string;

    paymentRecipient:
      string;
  };

  actual: {
    transactionHash:
      string | null;

    requestHash:
      `0x${string}`;

    toolId:
      string;

    method:
      string;

    chainId:
      number | null;

    amountRaw:
      string;

    paymentToken:
      string;

    paymentRecipient:
      string;
  };

  outcome: {
    title:
      string;

    message:
      string;

    paymentStopped:
      boolean;

    payerInvoked:
      boolean;

    broadcast:
      boolean;
  };

  technical: {
    findingCode:
      string | null;

    authorizedRequestHash:
      `0x${string}`;

    actualRequestHash:
      `0x${string}`;
  };
};

function sameText(
  left:
    string,
  right:
    string
): boolean {
  return (
    left.toLowerCase() ===
    right.toLowerCase()
  );
}

function asRecord(
  value:
    JsonValue
):
  | Record<
      string,
      JsonValue
    >
  | null {
  if (
    typeof value !==
      "object" ||
    value ===
      null ||
    Array.isArray(
      value
    )
  ) {
    return null;
  }

  return value;
}

function readActualTransactionHash(
  request:
    ToolRequest
): string | null {
  const args =
    asRecord(
      request.arguments
    );

  if (
    !args
  ) {
    return null;
  }

  const value =
    args.transactionHash;

  return typeof value ===
    "string"
    ? value
    : null;
}

function readActualChainId(
  request:
    ToolRequest
): number | null {
  const args =
    asRecord(
      request.arguments
    );

  if (
    !args
  ) {
    return null;
  }

  const value =
    args.chainId;

  return typeof value ===
    "number"
    ? value
    : null;
}

function getPriceStatus(
  actualAmount:
    string,
  maxAmount:
    string
): ChangeStatus {
  const actual =
    BigInt(
      actualAmount
    );

  const maximum =
    BigInt(
      maxAmount
    );

  if (
    actual ===
    maximum
  ) {
    return "SAME";
  }

  if (
    actual <
    maximum
  ) {
    return "WITHIN_AUTHORIZATION";
  }

  return "CHANGED";
}

export function buildWhatChangedReport(
  input: {
    manifest:
      TransactionAnalysisIntentManifest;

    actualRequest:
      ToolRequest;

    challenge:
      MppPaymentChallenge;

    guard: {
      decision:
        GuardDecision;

      findingCode:
        string | null;

      requestMatches:
        boolean | null;
    };

    execution: {
      payerInvoked:
        boolean;

      broadcast:
        boolean;
    };
  }
): WhatChangedReport {
  const {
    manifest,
    actualRequest,
    challenge,
    guard,
    execution,
  } = input;

  const actualRequestHash =
    getToolRequestHash(
      actualRequest
    );

  const actualTransactionHash =
    readActualTransactionHash(
      actualRequest
    );

  const actualChainId =
    readActualChainId(
      actualRequest
    );

  const transactionChanged =
    !actualTransactionHash ||
    !sameText(
      manifest
        .request
        .transactionHash,
      actualTransactionHash
    );

  const toolChanged =
    manifest
      .request
      .toolId !==
      actualRequest.toolId ||
    manifest
      .request
      .method !==
      actualRequest.method;

  const networkChanged =
    actualChainId !==
      manifest
        .network
        .chainId ||
    challenge.chainId !==
      manifest
        .network
        .chainId;

  const tokenChanged =
    !sameText(
      manifest
        .payment
        .token,
      challenge.currency
    );

  const merchantChanged =
    !sameText(
      manifest
        .payment
        .recipient,
      challenge.recipient
    );

  const requestChanged =
    guard.requestMatches ===
      false ||
    !sameText(
      manifest
        .request
        .requestHash,
      actualRequestHash
    );

  let title:
    string;

  let message:
    string;

  if (
    guard.decision ===
    "ALLOW"
  ) {
    title =
      "Request stayed intact";

    message =
      "BOUND verified the actual request against the exact authorized intent. Payment may proceed.";
  } else if (
    guard.decision ===
      "BLOCK" &&
    requestChanged
  ) {
    title =
      "Request changed after approval";

    message =
      "BOUND stopped the payment because the actual agent request no longer matched the exact request the user authorized.";
  } else if (
    guard.decision ===
    "BLOCK"
  ) {
    title =
      "Payment conditions changed after approval";

    message =
      "BOUND stopped the payment because the payment conditions no longer matched the authorization.";
  } else {
    title =
      "New authorization required";

    message =
      "The current authorization is no longer sufficient for this payment.";
  }

  return {
    version:
      WHAT_CHANGED_VERSION,

    decision:
      guard.decision,

    comparison: {
      transaction:
        transactionChanged
          ? "CHANGED"
          : "SAME",

      analysisTool:
        toolChanged
          ? "CHANGED"
          : "SAME",

      network:
        networkChanged
          ? "CHANGED"
          : "SAME",

      price:
        getPriceStatus(
          challenge.amount,
          manifest
            .payment
            .maxAmountRaw
        ),

      token:
        tokenChanged
          ? "CHANGED"
          : "SAME",

      merchant:
        merchantChanged
          ? "CHANGED"
          : "SAME",

      request:
        requestChanged
          ? "CHANGED"
          : "SAME",
    },

    authorized: {
      transactionHash:
        manifest
          .request
          .transactionHash,

      requestHash:
        manifest
          .request
          .requestHash,

      toolId:
        manifest
          .request
          .toolId,

      method:
        manifest
          .request
          .method,

      chainId:
        manifest
          .network
          .chainId,

      maxAmountRaw:
        manifest
          .payment
          .maxAmountRaw,

      paymentToken:
        manifest
          .payment
          .token,

      paymentRecipient:
        manifest
          .payment
          .recipient,
    },

    actual: {
      transactionHash:
        actualTransactionHash,

      requestHash:
        actualRequestHash,

      toolId:
        actualRequest.toolId,

      method:
        actualRequest.method,

      chainId:
        actualChainId,

      amountRaw:
        challenge.amount,

      paymentToken:
        challenge.currency,

      paymentRecipient:
        challenge.recipient,
    },

    outcome: {
      title,

      message,

      paymentStopped:
        guard.decision !==
        "ALLOW",

      payerInvoked:
        execution.payerInvoked,

      broadcast:
        execution.broadcast,
    },

    technical: {
      findingCode:
        guard.findingCode,

      authorizedRequestHash:
        manifest
          .request
          .requestHash,

      actualRequestHash,
    },
  };
}
