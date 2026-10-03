import {
  getAddress,
  type Address,
  type Hash,
} from "viem";

import {
  normalizeTransactionInput,
} from "../chain/transaction-intelligence.js";

import {
  mppRequestAuthorizationSchema,
  type MppRequestAuthorization,
} from "./mpp-request-bound.js";

import {
  getToolRequestHash,
  parseToolRequest,
  type ToolRequest,
} from "./request-bound.js";

export const INTENT_MANIFEST_VERSION =
  "bound.intent-manifest.v1" as const;

export const TRANSACTION_ANALYSIS_TOOL_ID =
  "bound-transaction-analysis" as const;

export const TRANSACTION_ANALYSIS_METHOD =
  "analyze_transaction" as const;

export const TRANSACTION_ANALYSIS_CHAIN_ID =
  97 as const;

export const TRANSACTION_ANALYSIS_NETWORK =
  "BNB Smart Chain Testnet" as const;

const UNSIGNED_INTEGER_PATTERN =
  /^(0|[1-9]\d*)$/;

export type TransactionAnalysisIntentManifest = {
  version:
    typeof INTENT_MANIFEST_VERSION;

  action:
    "Analyze transaction";

  network: {
    name:
      typeof TRANSACTION_ANALYSIS_NETWORK;

    chainId:
      typeof TRANSACTION_ANALYSIS_CHAIN_ID;
  };

  request: {
    toolId:
      typeof TRANSACTION_ANALYSIS_TOOL_ID;

    method:
      typeof TRANSACTION_ANALYSIS_METHOD;

    transactionHash:
      Hash;

    requestHash:
      `0x${string}`;
  };

  payment: {
    protocol:
      "MPP";

    token:
      Address;

    recipient:
      Address;

    maxAmountRaw:
      string;

    credentialType:
      "hash";
  };

  authorization: {
    authorizationId:
      string;

    validUntil:
      number;
  };

  integrity: {
    mode:
      "exact_request";

    paymentAuthorizedOnlyForRequestHash:
      true;
  };
};

export type TransactionAnalysisIntentBundle = {
  request:
    ToolRequest;

  authorization:
    MppRequestAuthorization;

  manifest:
    TransactionAnalysisIntentManifest;
};

export function buildTransactionAnalysisToolRequest(
  transactionInput:
    string
): ToolRequest {
  const normalized =
    normalizeTransactionInput(
      transactionInput
    );

  return parseToolRequest({
    toolId:
      TRANSACTION_ANALYSIS_TOOL_ID,

    method:
      TRANSACTION_ANALYSIS_METHOD,

    arguments: {
      chainId:
        TRANSACTION_ANALYSIS_CHAIN_ID,

      transactionHash:
        normalized.hash,
    },
  });
}

export function buildTransactionAnalysisIntent(
  input: {
    transactionInput:
      string;

    authorizationId:
      string;

    paymentToken:
      string;

    paymentRecipient:
      string;

    maxAmountRaw:
      string;

    validUntil:
      number;
  }
): TransactionAnalysisIntentBundle {
  const authorizationId =
    input.authorizationId.trim();

  if (
    authorizationId.length ===
    0
  ) {
    throw new Error(
      "EMPTY_AUTHORIZATION_ID"
    );
  }

  if (
    !UNSIGNED_INTEGER_PATTERN.test(
      input.maxAmountRaw
    )
  ) {
    throw new Error(
      "INVALID_MAX_AMOUNT_RAW"
    );
  }

  if (
    !Number.isSafeInteger(
      input.validUntil
    ) ||
    input.validUntil <=
      0
  ) {
    throw new Error(
      "INVALID_VALID_UNTIL"
    );
  }

  const normalized =
    normalizeTransactionInput(
      input.transactionInput
    );

  const request =
    buildTransactionAnalysisToolRequest(
      normalized.hash
    );

  const requestHash =
    getToolRequestHash(
      request
    );

  const paymentToken =
    getAddress(
      input.paymentToken
    );

  const paymentRecipient =
    getAddress(
      input.paymentRecipient
    );

  const authorization =
    mppRequestAuthorizationSchema.parse({
      authorizationId,

      requestHash,

      toolId:
        request.toolId,

      method:
        request.method,

      chainId:
        TRANSACTION_ANALYSIS_CHAIN_ID,

      paymentToken,

      paymentRecipient,

      maxAmountRaw:
        input.maxAmountRaw,

      credentialType:
        "hash",

      validUntil:
        input.validUntil,
    });

  const manifest:
    TransactionAnalysisIntentManifest = {
    version:
      INTENT_MANIFEST_VERSION,

    action:
      "Analyze transaction",

    network: {
      name:
        TRANSACTION_ANALYSIS_NETWORK,

      chainId:
        TRANSACTION_ANALYSIS_CHAIN_ID,
    },

    request: {
      toolId:
        TRANSACTION_ANALYSIS_TOOL_ID,

      method:
        TRANSACTION_ANALYSIS_METHOD,

      transactionHash:
        normalized.hash,

      requestHash,
    },

    payment: {
      protocol:
        "MPP",

      token:
        paymentToken,

      recipient:
        paymentRecipient,

      maxAmountRaw:
        input.maxAmountRaw,

      credentialType:
        "hash",
    },

    authorization: {
      authorizationId,

      validUntil:
        input.validUntil,
    },

    integrity: {
      mode:
        "exact_request",

      paymentAuthorizedOnlyForRequestHash:
        true,
    },
  };

  return {
    request,
    authorization,
    manifest,
  };
}
