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
  http,
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
  type NativeEvidenceEnvelope,
  type RawNativeTransaction,
  getNativeEvidenceId,
  nativeEvidenceEnvelopeSchema,
  rawNativeTransactionSchema,
  verifyRawNativeTransfer,
} from "../core/native.js";

import {
  verifySignedNativeAuthorization,
} from "../core/native-authorization.js";

import {
  FileEvidenceUseStore,
  gateSigning,
} from "../core/replay.js";

import {
  loadTrustedSource,
} from "../core/trust.js";

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

const SOURCE_ID =
  "native-market-report-tool";

const RESOURCE_ID =
  "bnb-market-report";

const SESSION_MAX_LIFETIME_MS =
  10 * 60 * 1000;

const MAX_REQUEST_BODY_BYTES =
  64 * 1024;

/*
 * Browser origins allowed during local
 * development.
 */
const ALLOWED_ORIGINS =
  new Set([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]);

/*
 * =======================================================
 * QUOTE RESPONSE
 * =======================================================
 */

const quoteResponseSchema =
  z.object({
    resource:
      z.object({
        id:
          z.string(),

        name:
          z.string(),

        price:
          z.object({
            display:
              z.string(),

            amountWei:
              z.string()
                .regex(
                  /^(0|[1-9]\d*)$/
                ),
          }),
      }),

    envelope:
      nativeEvidenceEnvelopeSchema,
  });

type QuoteResponse =
  z.infer<
    typeof quoteResponseSchema
  >;

/*
 * =======================================================
 * API REQUEST SCHEMAS
 * =======================================================
 */

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
 * SESSION RECORD
 * =======================================================
 *
 * Trusted authorization and signed evidence
 * remain server-side.
 *
 * The browser receives only the public context
 * required to render the product interface.
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
    QuoteResponse;

  trustedSources:
    TrustedSources;
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
 * LOCAL TRUST LOADERS
 * =======================================================
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
 * REAL SIGNED TOOL QUOTE
 * =======================================================
 */

async function fetchNativeQuote():
Promise<QuoteResponse> {
  const response =
    await fetch(
      `${TOOL_URL}/quote`,
      {
        method:
          "POST",

        headers: {
          "content-type":
            "application/json",
        },

        body:
          JSON.stringify({
            resourceId:
              RESOURCE_ID,
          }),
      }
    );

  if (
    !response.ok
  ) {
    throw new Error(
      `Native tool returned HTTP ${response.status}.`
    );
  }

  const raw =
    await response.json();

  return quoteResponseSchema.parse(
    raw
  );
}

/*
 * =======================================================
 * SESSION CLEANUP
 * =======================================================
 */

function removeExpiredSessions() {
  const now =
    Date.now();

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

function getSession(
  sessionId:
    string
):
  | SessionRecord
  | null {
  removeExpiredSessions();

  const session =
    sessions.get(
      sessionId
    );

  if (
    !session
  ) {
    return null;
  }

  if (
    session.expiresAt <=
    Date.now()
  ) {
    sessions.delete(
      sessionId
    );

    return null;
  }

  return session;
}

/*
 * =======================================================
 * COMPARISON VIEW
 * =======================================================
 *
 * This is only explanatory output for the UI.
 *
 * Security decisions still come from
 * verifyRawNativeTransfer().
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
 * CREATE REAL VERIFICATION SESSION
 * =======================================================
 */

async function createVerificationSession() {
  /*
   * ---------------------------------------------------
   * VERIFY USER AUTHORIZATION
   * ---------------------------------------------------
   */

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

  /*
   * ---------------------------------------------------
   * FETCH REAL SIGNED TOOL EVIDENCE
   * ---------------------------------------------------
   */

  const quote =
    await fetchNativeQuote();

  /*
   * ---------------------------------------------------
   * LOAD PINNED TOOL TRUST
   * ---------------------------------------------------
   */

  const trustedSources =
    await loadTrustedSource({
      sourceId:
        SOURCE_ID,
    });

  const evidence =
    quote.envelope
      .evidence;

  /*
   * ---------------------------------------------------
   * BUILD DEFAULT TRANSACTION
   * ---------------------------------------------------
   *
   * This transaction mirrors the trusted
   * signed evidence.
   */

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

  /*
   * ---------------------------------------------------
   * VERIFY SESSION BASELINE
   * ---------------------------------------------------
   *
   * Session creation itself fails closed if
   * authorization, evidence, or trusted source
   * are inconsistent.
   */

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

  /*
   * ---------------------------------------------------
   * SESSION LIFETIME
   * ---------------------------------------------------
   */

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

  /*
   * ---------------------------------------------------
   * PUBLIC SESSION VIEW
   * ---------------------------------------------------
   */

  return {
    sessionId,

    createdAt:
      now,

    expiresAt,

    authorization: {
      signatureScheme:
        "EIP-712",

      signer:
        authorizationVerification
          .signer,

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

    transaction:
      defaultTransaction,

    baselineVerification,
  };
}

/*
 * =======================================================
 * VERIFY TRANSACTION
 * =======================================================
 *
 * Important:
 *
 * /api/verify does NOT consume replay state
 * and does NOT invoke the signer.
 *
 * It is safe to run repeatedly while the
 * session remains valid.
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
 * REAL REPLAY TEST
 * =======================================================
 *
 * This uses the actual FileEvidenceUseStore
 * and gateSigning implementation.
 *
 * First ALLOW claims the evidence.
 * Second use should be rejected as replay.
 *
 * No blockchain transaction is broadcast.
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
 * REAL ONCHAIN LOOKUP
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
      "BNB Smart Chain Testnet",

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
          "BSC Testnet",

        chainId:
          bscTestnet.id,

        nativeTool:
          TOOL_URL,
      }
    );

    return;
  }

  /*
   * ---------------------------------------------------
   * CREATE SESSION
   * ---------------------------------------------------
   */

  if (
    method ===
      "POST" &&
    url.pathname ===
      "/api/session"
  ) {
    const session =
      await createVerificationSession();

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
   * VERIFY CANDIDATE
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
      verifyRequestSchema
        .parse(
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
   * REAL REPLAY PROTECTION TEST
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
      replayRequestSchema
        .parse(
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

    if (!hash) {
      throw new Error(
        "INVALID_TRANSACTION_HASH"
      );
    }

    const result =
      await lookupOnchainTransaction(
        hash as `0x${string}`
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
      "\nRoutes:"
    );

    console.log(
      "GET  /api/health"
    );

    console.log(
      "POST /api/session"
    );

    console.log(
      "POST /api/verify"
    );

    console.log(
      "POST /api/replay-test"
    );

    console.log(
      "GET  /api/onchain/:hash"
    );

    console.log(
      "\nPrivate signing keys are not loaded by this API."
    );

    console.log(
      "Browser-triggered blockchain execution is disabled."
    );
  }
);
