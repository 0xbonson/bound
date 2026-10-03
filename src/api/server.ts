import {
  randomUUID,
} from "node:crypto";

import {
  readFile,
} from "node:fs/promises";

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import {
  createPublicClient,
  formatEther,
  getAddress,
  http,
  parseEther,
} from "viem";

import {
  bscTestnet,
} from "viem/chains";

import {
  z,
} from "zod";

import {
  type TrustedSources,
} from "../core/bound.js";

import {
  type NativeAuthorization,
  type RawNativeTransaction,
  getNativeEvidenceId,
  rawNativeTransactionSchema,
  verifyRawNativeTransfer,
} from "../core/native.js";

import {
  NATIVE_AUTHORIZATION_VERSION,
  buildNativeAuthorizationTypedData,
  verifySignedNativeAuthorization,
} from "../core/native-authorization.js";

import {
  FileEvidenceUseStore,
  gateSigning,
} from "../core/replay.js";

import {
  loadTrustedSource,
} from "../core/trust.js";

import {
  PURCHASING_AGENT_ASSET_SYMBOL,
  PURCHASING_AGENT_CHAIN_ID,
  PURCHASING_AGENT_NETWORK,
  PURCHASING_AGENT_RESOURCE_ID,
  PURCHASING_AGENT_SOURCE_ID,
  fetchSignedMarketReportQuote,
  getPurchasingAgentModel,
  planPurchaseIntent,
  runPurchasingAgent,
  type PurchaseIntent,
  type PurchasingAgentScenario,
  type PurchasingQuote,
} from "../agent/purchasing-agent.js";

import {
  fetchTransactionFacts,
  normalizeTransactionInput,
} from "../chain/transaction-intelligence.js";

import {
  buildTransactionExplanation,
} from "../chain/transaction-explanation.js";


/*
 * =======================================================
 * CONFIGURATION
 * =======================================================
 */

const HOST =
  process.env.BOUND_API_HOST ??
  "127.0.0.1";

const PORT =
  Number(
    process.env.BOUND_API_PORT ??
    "8790"
  );

const TOOL_URL =
  process.env.BOUND_NATIVE_TOOL_URL ??
  "http://127.0.0.1:8788";

const BSC_RPC_URL =
  process.env.BSC_TESTNET_RPC ??
  "https://data-seed-prebsc-1-s1.bnbchain.org:8545/";

const AUTHORIZATION_PATH =
  ".bound/authorization/native.json";

const USER_ADDRESS_PATH =
  ".bound/user/address";

const SESSION_MAX_LIFETIME_MS =
  10 * 60 * 1000;

const INTENT_LIFETIME_MS =
  5 * 60 * 1000;

const AUTHORIZATION_DRAFT_LIFETIME_MS =
  5 * 60 * 1000;

const USER_AUTHORIZATION_LIFETIME_MS =
  10 * 60 * 1000;

const MAX_REQUEST_BODY_BYTES =
  64 * 1024;

const ALLOWED_ORIGINS =
  new Set([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]);

/*
 * =======================================================
 * API REQUEST SCHEMAS
 * =======================================================
 */

const taskRequestSchema =
  z.object({
    task:
      z.string()
        .trim()
        .min(1)
        .max(2_000),
  });

const transactionInspectRequestSchema =
  z.object({
    input:
      z.string()
        .trim()
        .min(1)
        .max(500),
  });

const authorizationDraftRequestSchema =
  z.object({
    intentId:
      z.string()
        .uuid(),

    walletAddress:
      z.string()
        .min(1),
  });

const authorizationConfirmRequestSchema =
  z.object({
    authorizationId:
      z.string()
        .uuid(),

    signature:
      z.string()
        .regex(
          /^0x[0-9a-fA-F]{130}$/
        ),
  });

const agentRunRequestSchema =
  z.object({
    authorizationId:
      z.string()
        .uuid(),

    scenario:
      z.enum([
        "normal",
        "poisoned",
      ])
        .optional()
        .default(
          "normal"
        ),
  });

const verifyRequestSchema =
  z.object({
    sessionId:
      z.string()
        .uuid(),

    transaction:
      rawNativeTransactionSchema,
  });

const replayRequestSchema =
  z.object({
    sessionId:
      z.string()
        .uuid(),

    transaction:
      rawNativeTransactionSchema,
  });

/*
 * =======================================================
 * SERVER-SIDE INTENT RECORD
 * =======================================================
 */

type IntentRecord = {
  id:
  string;

  createdAt:
  number;

  expiresAt:
  number;

  task:
  string;

  intent:
  PurchaseIntent;
};

const intents =
  new Map<
    string,
    IntentRecord
  >();

/*
 * =======================================================
 * SERVER-SIDE AUTHORIZATION DRAFT
 * =======================================================
 *
 * The browser supplies the connected wallet address when
 * the draft is created.
 *
 * BOUND then pins that address and the exact authorization
 * fields server-side before requesting a signature.
 *
 * The later signature must recover to that pinned address.
 *
 * This proves control of that wallet for this authorization.
 * It is not a general account-identity system.
 */

type AuthorizationDraftRecord = {
  id:
  string;

  intentId:
  string;

  createdAt:
  number;

  expiresAt:
  number;

  expectedSigner:
  `0x${string}`;

  task:
  string;

  authorization:
  NativeAuthorization;
};

const authorizationDrafts =
  new Map<
    string,
    AuthorizationDraftRecord
  >();

/*
 * =======================================================
 * CONFIRMED AUTHORIZATION
 * =======================================================
 */

type ConfirmedAuthorizationRecord = {
  id:
  string;

  intentId:
  string;

  confirmedAt:
  number;

  expectedSigner:
  `0x${string}`;

  task:
  string;

  signedAuthorization:
  unknown;

  authorization:
  NativeAuthorization;
};

const confirmedAuthorizations =
  new Map<
    string,
    ConfirmedAuthorizationRecord
  >();

/*
 * =======================================================
 * VERIFICATION SESSION
 * =======================================================
 *
 * Signed authorization and signed tool evidence remain
 * server-side.
 *
 * Browser edits are treated only as candidate transaction
 * fields.
 */

type SessionRecord = {
  id:
  string;

  createdAt:
  number;

  expiresAt:
  number;

  expectedUserSigner:
  string;

  signedAuthorization:
  unknown;

  authorization:
  NativeAuthorization;

  quote:
  PurchasingQuote;

  trustedSources:
  TrustedSources;

  task?:
  string;

  scenario?:
  PurchasingAgentScenario;
};

const sessions =
  new Map<
    string,
    SessionRecord
  >();

/*
 * =======================================================
 * PUBLIC BSC CLIENT
 * =======================================================
 */

const publicClient =
  createPublicClient({
    chain:
      bscTestnet,

    transport:
      http(
        BSC_RPC_URL
      ),
  });

/*
 * =======================================================
 * HTTP HELPERS
 * =======================================================
 */

function getOrigin(
  request:
    IncomingMessage
) {
  const origin =
    request.headers.origin;

  if (
    !origin ||
    !ALLOWED_ORIGINS.has(
      origin
    )
  ) {
    return null;
  }

  return origin;
}

function setCommonHeaders(
  request:
    IncomingMessage,
  response:
    ServerResponse
) {
  response.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );

  response.setHeader(
    "Cache-Control",
    "no-store"
  );

  response.setHeader(
    "X-Content-Type-Options",
    "nosniff"
  );

  const origin =
    getOrigin(
      request
    );

  if (
    origin
  ) {
    response.setHeader(
      "Access-Control-Allow-Origin",
      origin
    );

    response.setHeader(
      "Vary",
      "Origin"
    );

    response.setHeader(
      "Access-Control-Allow-Headers",
      "content-type"
    );

    response.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,OPTIONS"
    );
  }
}

function sendJson(
  request:
    IncomingMessage,
  response:
    ServerResponse,
  statusCode:
    number,
  data:
    unknown
) {
  setCommonHeaders(
    request,
    response
  );

  response.statusCode =
    statusCode;

  response.end(
    JSON.stringify(
      data,
      null,
      2
    )
  );
}

async function readJsonBody(
  request:
    IncomingMessage
): Promise<unknown> {
  let body = "";

  for await (
    const chunk of request
  ) {
    body +=
      chunk.toString();

    if (
      Buffer.byteLength(
        body
      ) >
      MAX_REQUEST_BODY_BYTES
    ) {
      throw new Error(
        "REQUEST_BODY_TOO_LARGE"
      );
    }
  }

  if (
    body.trim() === ""
  ) {
    return {};
  }

  try {
    return JSON.parse(
      body
    ) as unknown;
  } catch {
    throw new Error(
      "INVALID_JSON"
    );
  }
}

/*
 * =======================================================
 * LOCAL LEGACY AUTHORIZATION LOADERS
 * =======================================================
 *
 * These remain temporarily so the old /api/session route
 * continues working while the frontend is migrated.
 */

async function loadSignedAuthorization():
  Promise<unknown> {
  const raw =
    await readFile(
      AUTHORIZATION_PATH,
      "utf8"
    );

  return JSON.parse(
    raw
  ) as unknown;
}

async function loadExpectedUserSigner():
  Promise<string> {
  return (
    await readFile(
      USER_ADDRESS_PATH,
      "utf8"
    )
  ).trim();
}

/*
 * =======================================================
 * RECORD CLEANUP
 * =======================================================
 */

function removeExpiredRecords() {
  const now =
    Date.now();

  for (
    const [
      intentId,
      intent,
    ] of intents
  ) {
    if (
      intent.expiresAt <=
      now
    ) {
      intents.delete(
        intentId
      );
    }
  }

  for (
    const [
      authorizationId,
      draft,
    ] of authorizationDrafts
  ) {
    if (
      draft.expiresAt <=
      now
    ) {
      authorizationDrafts.delete(
        authorizationId
      );
    }
  }

  for (
    const [
      authorizationId,
      confirmed,
    ] of confirmedAuthorizations
  ) {
    if (
      confirmed.authorization
        .validUntil <=
      now
    ) {
      confirmedAuthorizations.delete(
        authorizationId
      );
    }
  }

  for (
    const [
      sessionId,
      session,
    ] of sessions
  ) {
    if (
      session.expiresAt <=
      now
    ) {
      sessions.delete(
        sessionId
      );
    }
  }
}

function getIntent(
  intentId:
    string
):
  | IntentRecord
  | null {
  removeExpiredRecords();

  return (
    intents.get(
      intentId
    ) ??
    null
  );
}

function getAuthorizationDraft(
  authorizationId:
    string
):
  | AuthorizationDraftRecord
  | null {
  removeExpiredRecords();

  return (
    authorizationDrafts.get(
      authorizationId
    ) ??
    null
  );
}

function getConfirmedAuthorization(
  authorizationId:
    string
):
  | ConfirmedAuthorizationRecord
  | null {
  removeExpiredRecords();

  return (
    confirmedAuthorizations.get(
      authorizationId
    ) ??
    null
  );
}

function getSession(
  sessionId:
    string
):
  | SessionRecord
  | null {
  removeExpiredRecords();

  return (
    sessions.get(
      sessionId
    ) ??
    null
  );
}

/*
 * =======================================================
 * BROWSER EIP-712 PAYLOAD
 * =======================================================
 *
 * buildNativeAuthorizationTypedData() remains the canonical
 * typed-data builder.
 *
 * This helper only converts bigint values to JSON-safe
 * decimal strings and adds the explicit EIP712Domain type
 * expected by eth_signTypedData_v4 payloads.
 */

function buildBrowserTypedData(
  authorization:
    NativeAuthorization
) {
  const typedData =
    buildNativeAuthorizationTypedData(
      authorization
    );

  const message =
    Object.fromEntries(
      Object.entries(
        typedData.message
      )
        .map(
          ([
            key,
            value,
          ]) => [
              key,
              typeof value ===
                "bigint"
                ? value.toString()
                : value,
            ]
        )
    );

  return {
    domain:
      typedData.domain,

    primaryType:
      typedData.primaryType,

    types: {
      EIP712Domain: [
        {
          name:
            "name",
          type:
            "string",
        },
        {
          name:
            "version",
          type:
            "string",
        },
        {
          name:
            "chainId",
          type:
            "uint256",
        },
      ],

      ...typedData.types,
    },

    message,
  };
}

/*
 * =======================================================
 * PURCHASE INTENT
 * =======================================================
 */

async function createPurchaseIntent(
  task:
    string
) {
  const intent =
    await planPurchaseIntent(
      task
    );

  const readyForAuthorization =
    intent.supported &&
    !intent.needsClarification &&
    intent.resourceId ===
    PURCHASING_AGENT_RESOURCE_ID &&
    intent.maxAmountTbnb !==
    null;

  if (
    !readyForAuthorization
  ) {
    return {
      readyForAuthorization:
        false,

      intentId:
        null,

      intent,
    };
  }

  const now =
    Date.now();

  const intentId =
    randomUUID();

  const record:
    IntentRecord = {
    id:
      intentId,

    createdAt:
      now,

    expiresAt:
      now +
      INTENT_LIFETIME_MS,

    task,

    intent,
  };

  intents.set(
    intentId,
    record
  );

  return {
    readyForAuthorization:
      true,

    intentId,

    createdAt:
      now,

    expiresAt:
      record.expiresAt,

    intent,
  };
}

/*
 * =======================================================
 * AUTHORIZATION DRAFT
 * =======================================================
 */

function createAuthorizationDraft(
  intent:
    IntentRecord,
  rawWalletAddress:
    string
) {
  let expectedSigner:
    `0x${string}`;

  try {
    expectedSigner =
      getAddress(
        rawWalletAddress
      );
  } catch {
    throw new Error(
      "INVALID_WALLET_ADDRESS"
    );
  }

  const maxAmountTbnb =
    intent.intent
      .maxAmountTbnb;

  if (
    !maxAmountTbnb
  ) {
    throw new Error(
      "INTENT_HAS_NO_SPENDING_LIMIT"
    );
  }

  let maxAmountWei:
    bigint;

  try {
    maxAmountWei =
      parseEther(
        maxAmountTbnb
      );
  } catch {
    throw new Error(
      "INVALID_SPENDING_LIMIT"
    );
  }

  if (
    maxAmountWei <=
    0n
  ) {
    throw new Error(
      "INVALID_SPENDING_LIMIT"
    );
  }

  const now =
    Date.now();

  const authorizationId =
    randomUUID();

  const validUntil =
    now +
    USER_AUTHORIZATION_LIFETIME_MS;

  const authorization:
    NativeAuthorization = {
    authorizationId,

    resourceId:
      PURCHASING_AGENT_RESOURCE_ID,

    chainId:
      PURCHASING_AGENT_CHAIN_ID,

    assetType:
      "native",

    assetSymbol:
      PURCHASING_AGENT_ASSET_SYMBOL,

    maxAmountWei:
      maxAmountWei.toString(),

    trustedSourceId:
      PURCHASING_AGENT_SOURCE_ID,

    validUntil,
  };

  const draft:
    AuthorizationDraftRecord = {
    id:
      authorizationId,

    intentId:
      intent.id,

    createdAt:
      now,

    expiresAt:
      Math.min(
        now +
        AUTHORIZATION_DRAFT_LIFETIME_MS,

        validUntil
      ),

    expectedSigner,

    task:
      intent.task,

    authorization,
  };

  authorizationDrafts.set(
    authorizationId,
    draft
  );

  return {
    authorizationId,

    intentId:
      intent.id,

    createdAt:
      now,

    draftExpiresAt:
      draft.expiresAt,

    expectedSigner,

    authorization: {
      resourceId:
        authorization.resourceId,

      chainId:
        authorization.chainId,

      network:
        PURCHASING_AGENT_NETWORK,

      assetType:
        authorization.assetType,

      assetSymbol:
        authorization.assetSymbol,

      maxAmountWei:
        authorization.maxAmountWei,

      maxAmountTbnb:
        formatEther(
          BigInt(
            authorization.maxAmountWei
          )
        ),

      trustedSourceId:
        authorization.trustedSourceId,

      validUntil:
        authorization.validUntil,
    },

    typedData:
      buildBrowserTypedData(
        authorization
      ),
  };
}

/*
 * =======================================================
 * CONFIRM WALLET AUTHORIZATION
 * =======================================================
 */

async function confirmAuthorization(
  draft:
    AuthorizationDraftRecord,
  signature:
    string
) {
  const envelope = {
    version:
      NATIVE_AUTHORIZATION_VERSION,

    signer:
      draft.expectedSigner,

    authorization:
      draft.authorization,

    signature,
  };

  const verification =
    await verifySignedNativeAuthorization({
      envelope,

      expectedSigner:
        draft.expectedSigner,
    });

  if (
    !verification.valid
  ) {
    return {
      confirmed:
        false as const,

      verification,
    };
  }

  const record:
    ConfirmedAuthorizationRecord = {
    id:
      draft.id,

    intentId:
      draft.intentId,

    confirmedAt:
      Date.now(),

    expectedSigner:
      draft.expectedSigner,

    task:
      draft.task,

    signedAuthorization:
      envelope,

    authorization:
      verification.authorization,
  };

  confirmedAuthorizations.set(
    draft.id,
    record
  );

  authorizationDrafts.delete(
    draft.id
  );

  return {
    confirmed:
      true as const,

    authorizationId:
      record.id,

    intentId:
      record.intentId,

    confirmedAt:
      record.confirmedAt,

    signer:
      verification.signer,

    authorization: {
      resourceId:
        record.authorization
          .resourceId,

      chainId:
        record.authorization
          .chainId,

      assetType:
        record.authorization
          .assetType,

      assetSymbol:
        record.authorization
          .assetSymbol,

      maxAmountWei:
        record.authorization
          .maxAmountWei,

      maxAmountTbnb:
        formatEther(
          BigInt(
            record.authorization
              .maxAmountWei
          )
        ),

      trustedSourceId:
        record.authorization
          .trustedSourceId,

      validUntil:
        record.authorization
          .validUntil,
    },
  };
}

/*
 * =======================================================
 * EXPLANATORY COMPARISON
 * =======================================================
 *
 * This output is for UI explanation only.
 *
 * The actual decision comes from verifyRawNativeTransfer().
 */

function buildComparison(
  session:
    SessionRecord,
  transaction:
    RawNativeTransaction
) {
  const evidence =
    session.quote
      .envelope
      .evidence;

  return {
    recipient: {
      expected:
        evidence.recipient,

      actual:
        transaction.to,

      matches:
        evidence.recipient
          .toLowerCase() ===
        transaction.to
          .toLowerCase(),
    },

    amount: {
      expectedWei:
        evidence.amountWei,

      actualWei:
        transaction.valueWei,

      matches:
        evidence.amountWei ===
        transaction.valueWei,
    },

    chain: {
      expected:
        evidence.chainId,

      actual:
        transaction.chainId,

      matches:
        evidence.chainId ===
        transaction.chainId,
    },

    calldata: {
      expected:
        "0x",

      actual:
        transaction.data,

      matches:
        transaction.data ===
        "0x",
    },
  };
}

/*
 * =======================================================
 * PUBLIC SESSION VIEW
 * =======================================================
 */

function buildPublicSessionView(
  session:
    SessionRecord,
  transaction:
    RawNativeTransaction,
  verification:
    ReturnType<
      typeof verifyRawNativeTransfer
    >
) {
  const authorization =
    session.authorization;

  const evidence =
    session.quote
      .envelope
      .evidence;

  return {
    sessionId:
      session.id,

    createdAt:
      session.createdAt,

    expiresAt:
      session.expiresAt,

    authorization: {
      signatureScheme:
        "EIP-712",

      signer:
        session.expectedUserSigner,

      authorizationId:
        authorization
          .authorizationId,

      resourceId:
        authorization
          .resourceId,

      chainId:
        authorization
          .chainId,

      assetType:
        authorization
          .assetType,

      assetSymbol:
        authorization
          .assetSymbol,

      maxAmountWei:
        authorization
          .maxAmountWei,

      maxAmountTbnb:
        formatEther(
          BigInt(
            authorization
              .maxAmountWei
          )
        ),

      trustedSourceId:
        authorization
          .trustedSourceId,

      validUntil:
        authorization
          .validUntil,
    },

    evidence: {
      signatureScheme:
        "Ed25519",

      evidenceId:
        getNativeEvidenceId(
          evidence
        ),

      sourceId:
        evidence
          .sourceId,

      resourceId:
        evidence
          .resourceId,

      chainId:
        evidence
          .chainId,

      assetType:
        evidence
          .assetType,

      assetSymbol:
        evidence
          .assetSymbol,

      recipient:
        evidence
          .recipient,

      amountWei:
        evidence
          .amountWei,

      amountTbnb:
        formatEther(
          BigInt(
            evidence
              .amountWei
          )
        ),

      nonce:
        evidence
          .nonce,

      issuedAt:
        evidence
          .issuedAt,

      expiresAt:
        evidence
          .expiresAt,
    },

    transaction,

    verification,

    comparison:
      buildComparison(
        session,
        transaction
      ),

    signerInvoked:
      false,

    broadcast:
      false,
  };
}

/*
 * =======================================================
 * LEGACY SESSION
 * =======================================================
 *
 * Kept temporarily for the existing dashboard.
 */

async function createLegacyVerificationSession() {
  const signedAuthorization =
    await loadSignedAuthorization();

  const expectedUserSigner =
    await loadExpectedUserSigner();

  const authorizationVerification =
    await verifySignedNativeAuthorization({
      envelope:
        signedAuthorization,

      expectedSigner:
        expectedUserSigner,
    });

  if (
    !authorizationVerification.valid
  ) {
    throw new Error(
      [
        "USER_AUTHORIZATION_INVALID",
        authorizationVerification.code,
        authorizationVerification.message,
      ].join(
        ": "
      )
    );
  }

  const authorization =
    authorizationVerification
      .authorization;

  const quote =
    await fetchSignedMarketReportQuote();

  const trustedSources =
    await loadTrustedSource({
      sourceId:
        PURCHASING_AGENT_SOURCE_ID,
    });

  const evidence =
    quote.envelope
      .evidence;

  const defaultTransaction =
    rawNativeTransactionSchema.parse({
      chainId:
        evidence.chainId,

      to:
        evidence.recipient,

      valueWei:
        evidence.amountWei,

      data:
        "0x",
    });

  const baselineVerification =
    verifyRawNativeTransfer({
      authorization,

      envelope:
        quote.envelope,

      trustedSources,

      rawTransaction:
        defaultTransaction,

      now:
        Date.now(),
    });

  if (
    baselineVerification.decision !==
    "ALLOW"
  ) {
    throw new Error(
      [
        "SESSION_BASELINE_REJECTED",
        baselineVerification
          .findings
          .map(
            (finding) =>
              finding.code
          )
          .join(","),
      ].join(
        ": "
      )
    );
  }

  const now =
    Date.now();

  const expiresAt =
    Math.min(
      now +
      SESSION_MAX_LIFETIME_MS,

      authorization
        .validUntil,

      evidence
        .expiresAt
    );

  if (
    expiresAt <=
    now
  ) {
    throw new Error(
      "SESSION_ALREADY_EXPIRED"
    );
  }

  const sessionId =
    randomUUID();

  const session:
    SessionRecord = {
    id:
      sessionId,

    createdAt:
      now,

    expiresAt,

    expectedUserSigner,

    signedAuthorization,

    authorization,

    quote,

    trustedSources,
  };

  sessions.set(
    sessionId,
    session
  );

  return {
    ...buildPublicSessionView(
      session,
      defaultTransaction,
      baselineVerification
    ),

    baselineVerification,
  };
}

/*
 * =======================================================
 * RUN REAL GEMINI PURCHASING AGENT
 * =======================================================
 */

async function createAgentSession(
  confirmed:
    ConfirmedAuthorizationRecord,
  scenario:
    PurchasingAgentScenario
) {
  /*
   * Re-verify the original signed EIP-712 envelope before
   * allowing it to become authority for a new agent run.
   */

  const authorizationVerification =
    await verifySignedNativeAuthorization({
      envelope:
        confirmed.signedAuthorization,

      expectedSigner:
        confirmed.expectedSigner,
    });

  if (
    !authorizationVerification.valid
  ) {
    throw new Error(
      [
        "CONFIRMED_AUTHORIZATION_INVALID",
        authorizationVerification.code,
        authorizationVerification.message,
      ].join(
        ": "
      )
    );
  }

  const agent =
    await runPurchasingAgent({
      task:
        confirmed.task,

      scenario,
    });

  if (
    agent.status ===
    "NO_PROPOSAL"
  ) {
    return {
      status:
        "NO_PROPOSAL" as const,

      sessionCreated:
        false,

      agent,
    };
  }

  const quote =
    agent.quote;

  const transaction =
    rawNativeTransactionSchema.parse({
      chainId:
        agent.proposal
          .chainId,

      to:
        agent.proposal
          .recipient,

      valueWei:
        agent.proposal
          .valueWei,

      data:
        agent.proposal
          .data,
    });

  const trustedSources =
    await loadTrustedSource({
      sourceId:
        PURCHASING_AGENT_SOURCE_ID,
    });

  const authorization =
    authorizationVerification
      .authorization;

  const verification =
    verifyRawNativeTransfer({
      authorization,

      envelope:
        quote.envelope,

      trustedSources,

      rawTransaction:
        transaction,

      now:
        Date.now(),
    });

  /*
   * A BLOCK decision is still stored as a session.
   *
   * This is important for the poisoned-context demo:
   * the product must show the exact candidate Gemini
   * produced and the deterministic reason BOUND rejected
   * it.
   */

  const evidence =
    quote.envelope
      .evidence;

  const now =
    Date.now();

  const expiresAt =
    Math.min(
      now +
      SESSION_MAX_LIFETIME_MS,

      authorization
        .validUntil,

      evidence
        .expiresAt
    );

  if (
    expiresAt <=
    now
  ) {
    throw new Error(
      "SESSION_ALREADY_EXPIRED"
    );
  }

  const sessionId =
    randomUUID();

  const session:
    SessionRecord = {
    id:
      sessionId,

    createdAt:
      now,

    expiresAt,

    expectedUserSigner:
      confirmed.expectedSigner,

    signedAuthorization:
      confirmed.signedAuthorization,

    authorization,

    quote,

    trustedSources,

    task:
      confirmed.task,

    scenario,
  };

  sessions.set(
    sessionId,
    session
  );

  return {
    status:
      "SESSION_CREATED" as const,

    sessionCreated:
      true,

    agent: {
      status:
        agent.status,

      model:
        agent.model,

      task:
        agent.task,

      activity:
        agent.activity,

      proposal:
        agent.proposal,

      ...(agent.contextMutation
        ? {
          contextMutation:
            agent.contextMutation,
        }
        : {}),
    },

    ...buildPublicSessionView(
      session,
      transaction,
      verification
    ),
  };
}

/*
 * =======================================================
 * VERIFY EDITABLE TRANSACTION
 * =======================================================
 *
 * This route does not consume replay state and does not
 * invoke the signer.
 */

function verifySessionTransaction(
  session:
    SessionRecord,
  transaction:
    RawNativeTransaction
) {
  const verification =
    verifyRawNativeTransfer({
      authorization:
        session.authorization,

      envelope:
        session.quote
          .envelope,

      trustedSources:
        session.trustedSources,

      rawTransaction:
        transaction,

      now:
        Date.now(),
    });

  return {
    verification,

    comparison:
      buildComparison(
        session,
        transaction
      ),

    signerInvoked:
      false,

    broadcast:
      false,
  };
}

/*
 * =======================================================
 * REPLAY TEST
 * =======================================================
 *
 * This uses the real replay store and signing gate.
 *
 * It still does not broadcast a blockchain transaction.
 */

async function runReplayTest(
  session:
    SessionRecord,
  transaction:
    RawNativeTransaction
) {
  const verification =
    verifyRawNativeTransfer({
      authorization:
        session.authorization,

      envelope:
        session.quote
          .envelope,

      trustedSources:
        session.trustedSources,

      rawTransaction:
        transaction,

      now:
        Date.now(),
    });

  const store =
    new FileEvidenceUseStore();

  const first =
    await gateSigning({
      verification,

      store,
    });

  const second =
    await gateSigning({
      verification,

      store,
    });

  return {
    verification,

    firstGate:
      first,

    secondGate:
      second,

    signerInvoked:
      false,

    broadcast:
      false,

    note:
      "The real replay gate was exercised. No blockchain transaction was broadcast.",
  };
}

/*
 * =======================================================
 * ONCHAIN LOOKUP
 * =======================================================
 */

async function lookupOnchainTransaction(
  hash:
    `0x${string}`
) {
  const [
    transaction,
    receipt,
  ] =
    await Promise.all([
      publicClient
        .getTransaction({
          hash,
        }),

      publicClient
        .getTransactionReceipt({
          hash,
        }),
    ]);

  return {
    network:
      PURCHASING_AGENT_NETWORK,

    chainId:
      bscTestnet.id,

    hash:
      transaction.hash,

    blockNumber:
      transaction
        .blockNumber
        ?.toString() ??
      null,

    from:
      transaction.from,

    to:
      transaction.to,

    valueWei:
      transaction
        .value
        .toString(),

    valueTbnb:
      formatEther(
        transaction.value
      ),

    input:
      transaction.input,

    nonce:
      transaction.nonce,

    receiptStatus:
      receipt.status,

    gasUsed:
      receipt
        .gasUsed
        .toString(),

    transactionIndex:
      receipt
        .transactionIndex,
  };
}

/*
 * =======================================================
 * ROUTER
 * =======================================================
 */

async function handleRequest(
  request:
    IncomingMessage,
  response:
    ServerResponse
) {
  const method =
    request.method ??
    "GET";

  const host =
    request.headers.host ??
    `${HOST}:${PORT}`;

  const url =
    new URL(
      request.url ??
      "/",

      `http://${host}`
    );

  /*
   * ---------------------------------------------------
   * CORS PREFLIGHT
   * ---------------------------------------------------
   */

  if (
    method ===
    "OPTIONS"
  ) {
    setCommonHeaders(
      request,
      response
    );

    response.statusCode =
      204;

    response.end();

    return;
  }

  /*
   * ---------------------------------------------------
   * HEALTH
   * ---------------------------------------------------
   */

  if (
    method ===
    "GET" &&
    url.pathname ===
    "/api/health"
  ) {
    sendJson(
      request,
      response,
      200,
      {
        status:
          "ok",

        service:
          "BOUND API",

        environment:
          PURCHASING_AGENT_NETWORK,

        chainId:
          PURCHASING_AGENT_CHAIN_ID,

        nativeTool:
          TOOL_URL,

        purchasingAgent: {
          model:
            getPurchasingAgentModel(),

          resourceId:
            PURCHASING_AGENT_RESOURCE_ID,

          trustedSourceId:
            PURCHASING_AGENT_SOURCE_ID,

          assetSymbol:
            PURCHASING_AGENT_ASSET_SYMBOL,

          apiKeyConfigured:
            Boolean(
              process.env
                .GEMINI_API_KEY
            ),
        },

        browserExecution:
          false,
      }
    );

    return;
  }

  /*
   * ---------------------------------------------------
   * BOUND LENS — TRANSACTION INSPECTION
   * ---------------------------------------------------
   *
   * Blockchain facts are deterministic.
   * No AI decides whether the transaction is safe.
   */

  if (
    method ===
    "POST" &&
    url.pathname ===
    "/api/transaction/inspect"
  ) {
    const body =
      await readJsonBody(
        request
      );

    const parsed =
      transactionInspectRequestSchema
        .parse(
          body
        );

    try {
      /*
       * Validate the semantic input separately so malformed
       * hashes / unsupported explorer URLs return HTTP 400
       * instead of becoming an internal server error.
       */

      normalizeTransactionInput(
        parsed.input
      );
    } catch (
      error
    ) {
      sendJson(
        request,
        response,
        400,
        {
          error:
            "INVALID_TRANSACTION_INPUT",

          message:
            error instanceof Error
              ? error.message
              : "Invalid transaction input.",
        }
      );

      return;
    }

    const facts =
      await fetchTransactionFacts(
        parsed.input
      );

    const explanation =
      buildTransactionExplanation(
        facts
      );

    sendJson(
      request,
      response,
      200,
      {
        version:
          "bound.transaction-inspection.v1",

        facts,

        explanation,

        trust: {
          blockchainFacts:
            "deterministic",

          aiUsedForFacts:
            false,

          aiUsedForSecurityDecision:
            false,
        },
      }
    );

    return;
  }

  /*
   * ---------------------------------------------------
   * NATURAL-LANGUAGE PURCHASE INTENT
   * ---------------------------------------------------
   */

  if (
    method ===
    "POST" &&
    url.pathname ===
    "/api/intent"
  ) {
    const body =
      await readJsonBody(
        request
      );

    const parsed =
      taskRequestSchema.parse(
        body
      );

    const result =
      await createPurchaseIntent(
        parsed.task
      );

    sendJson(
      request,
      response,
      200,
      result
    );

    return;
  }

  /*
   * ---------------------------------------------------
   * CREATE EIP-712 AUTHORIZATION DRAFT
   * ---------------------------------------------------
   */

  if (
    method ===
    "POST" &&
    url.pathname ===
    "/api/authorization/draft"
  ) {
    const body =
      await readJsonBody(
        request
      );

    const parsed =
      authorizationDraftRequestSchema
        .parse(
          body
        );

    const intent =
      getIntent(
        parsed.intentId
      );

    if (
      !intent
    ) {
      sendJson(
        request,
        response,
        410,
        {
          error:
            "INTENT_EXPIRED",

          message:
            "Submit the purchasing request again to create a fresh intent.",
        }
      );

      return;
    }

    const draft =
      createAuthorizationDraft(
        intent,
        parsed.walletAddress
      );

    sendJson(
      request,
      response,
      201,
      draft
    );

    return;
  }

  /*
   * ---------------------------------------------------
   * CONFIRM WALLET EIP-712 SIGNATURE
   * ---------------------------------------------------
   */

  if (
    method ===
    "POST" &&
    url.pathname ===
    "/api/authorization/confirm"
  ) {
    const body =
      await readJsonBody(
        request
      );

    const parsed =
      authorizationConfirmRequestSchema
        .parse(
          body
        );

    const draft =
      getAuthorizationDraft(
        parsed.authorizationId
      );

    if (
      !draft
    ) {
      sendJson(
        request,
        response,
        410,
        {
          error:
            "AUTHORIZATION_DRAFT_EXPIRED",

          message:
            "Create a fresh authorization draft and sign it again.",
        }
      );

      return;
    }

    const result =
      await confirmAuthorization(
        draft,
        parsed.signature
      );

    if (
      !result.confirmed
    ) {
      sendJson(
        request,
        response,
        401,
        {
          error:
            "AUTHORIZATION_SIGNATURE_INVALID",

          verification:
            result.verification,
        }
      );

      return;
    }

    sendJson(
      request,
      response,
      200,
      result
    );

    return;
  }

  /*
   * ---------------------------------------------------
   * RUN GEMINI PURCHASING AGENT
   * ---------------------------------------------------
   */

  if (
    method ===
    "POST" &&
    url.pathname ===
    "/api/agent/run"
  ) {
    const body =
      await readJsonBody(
        request
      );

    const parsed =
      agentRunRequestSchema
        .parse(
          body
        );

    const confirmed =
      getConfirmedAuthorization(
        parsed.authorizationId
      );

    if (
      !confirmed
    ) {
      sendJson(
        request,
        response,
        410,
        {
          error:
            "AUTHORIZATION_EXPIRED",

          message:
            "Create and sign a fresh wallet authorization.",
        }
      );

      return;
    }

    const result =
      await createAgentSession(
        confirmed,
        parsed.scenario
      );

    sendJson(
      request,
      response,
      200,
      result
    );

    return;
  }

  /*
   * ---------------------------------------------------
   * LEGACY SESSION
   * ---------------------------------------------------
   */

  if (
    method ===
    "POST" &&
    url.pathname ===
    "/api/session"
  ) {
    const session =
      await createLegacyVerificationSession();

    sendJson(
      request,
      response,
      201,
      session
    );

    return;
  }

  /*
   * ---------------------------------------------------
   * VERIFY EDITABLE CANDIDATE
   * ---------------------------------------------------
   */

  if (
    method ===
    "POST" &&
    url.pathname ===
    "/api/verify"
  ) {
    const body =
      await readJsonBody(
        request
      );

    const parsed =
      verifyRequestSchema.parse(
        body
      );

    const session =
      getSession(
        parsed.sessionId
      );

    if (
      !session
    ) {
      sendJson(
        request,
        response,
        410,
        {
          error:
            "SESSION_EXPIRED",

          message:
            "Create a fresh BOUND verification session.",
        }
      );

      return;
    }

    const result =
      verifySessionTransaction(
        session,
        parsed.transaction
      );

    sendJson(
      request,
      response,
      200,
      {
        sessionId:
          session.id,

        ...result,
      }
    );

    return;
  }

  /*
   * ---------------------------------------------------
   * REPLAY PROTECTION TEST
   * ---------------------------------------------------
   */

  if (
    method ===
    "POST" &&
    url.pathname ===
    "/api/replay-test"
  ) {
    const body =
      await readJsonBody(
        request
      );

    const parsed =
      replayRequestSchema.parse(
        body
      );

    const session =
      getSession(
        parsed.sessionId
      );

    if (
      !session
    ) {
      sendJson(
        request,
        response,
        410,
        {
          error:
            "SESSION_EXPIRED",

          message:
            "Create a fresh BOUND verification session.",
        }
      );

      return;
    }

    const result =
      await runReplayTest(
        session,
        parsed.transaction
      );

    sendJson(
      request,
      response,
      200,
      {
        sessionId:
          session.id,

        ...result,
      }
    );

    return;
  }

  /*
   * ---------------------------------------------------
   * REAL BSC TESTNET LOOKUP
   * ---------------------------------------------------
   */

  const onchainMatch =
    url.pathname.match(
      /^\/api\/onchain\/(0x[0-9a-fA-F]{64})$/
    );

  if (
    method ===
    "GET" &&
    onchainMatch
  ) {
    const hash =
      onchainMatch[1];

    if (
      !hash
    ) {
      throw new Error(
        "INVALID_TRANSACTION_HASH"
      );
    }

    const result =
      await lookupOnchainTransaction(
        hash as
        `0x${string}`
      );

    sendJson(
      request,
      response,
      200,
      result
    );

    return;
  }

  /*
   * ---------------------------------------------------
   * NOT FOUND
   * ---------------------------------------------------
   */

  sendJson(
    request,
    response,
    404,
    {
      error:
        "NOT_FOUND",

      message:
        "BOUND API route not found.",
    }
  );
}

/*
 * =======================================================
 * SERVER
 * =======================================================
 */

const server =
  createServer(
    async (
      request,
      response
    ) => {
      try {
        await handleRequest(
          request,
          response
        );
      } catch (
      error
      ) {
        console.error(
          "[BOUND API]",
          error
        );

        if (
          error instanceof
          z.ZodError
        ) {
          sendJson(
            request,
            response,
            400,
            {
              error:
                "INVALID_REQUEST",

              message:
                "The request did not match the expected BOUND API schema.",

              issues:
                error.issues,
            }
          );

          return;
        }

        const message =
          error instanceof
            Error
            ? error.message
            : "Unknown server error.";

        if (
          message ===
          "INVALID_JSON"
        ) {
          sendJson(
            request,
            response,
            400,
            {
              error:
                "INVALID_JSON",

              message:
                "Request body must contain valid JSON.",
            }
          );

          return;
        }

        if (
          message ===
          "REQUEST_BODY_TOO_LARGE"
        ) {
          sendJson(
            request,
            response,
            413,
            {
              error:
                "REQUEST_BODY_TOO_LARGE",

              message:
                "Request body exceeded the BOUND API limit.",
            }
          );

          return;
        }

        if (
          message ===
          "INVALID_WALLET_ADDRESS"
        ) {
          sendJson(
            request,
            response,
            400,
            {
              error:
                "INVALID_WALLET_ADDRESS",

              message:
                "The connected wallet address is not a valid EVM address.",
            }
          );

          return;
        }

        if (
          message ===
          "INVALID_SPENDING_LIMIT" ||
          message ===
          "INTENT_HAS_NO_SPENDING_LIMIT"
        ) {
          sendJson(
            request,
            response,
            400,
            {
              error:
                "INVALID_SPENDING_LIMIT",

              message:
                "The purchasing request must contain a positive tBNB spending limit.",
            }
          );

          return;
        }

        sendJson(
          request,
          response,
          500,
          {
            error:
              "INTERNAL_ERROR",

            message,
          }
        );
      }
    }
  );

server.listen(
  PORT,
  HOST,
  () => {
    console.log(
      "\nBOUND API"
    );

    console.log(
      `http://${HOST}:${PORT}`
    );

    console.log(
      "\nProduct routes:"
    );

    console.log(
      "POST /api/intent"
    );

    console.log(
      "POST /api/authorization/draft"
    );

    console.log(
      "POST /api/authorization/confirm"
    );

    console.log(
      "POST /api/agent/run"
    );

    console.log(
      "POST /api/verify"
    );

    console.log(
      "\nCompatibility / proof routes:"
    );

    console.log(
      "POST /api/session"
    );

    console.log(
      "POST /api/replay-test"
    );

    console.log(
      "GET  /api/onchain/:hash"
    );

    console.log(
      "GET  /api/health"
    );

    console.log(
      "\nPrivate signing keys are not loaded by this API."
    );

    console.log(
      "Browser-triggered blockchain execution is disabled."
    );
  }
);