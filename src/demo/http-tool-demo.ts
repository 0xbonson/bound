import {
  encodeFunctionData,
  getAddress,
  parseAbi,
} from "viem";

import {
  z,
} from "zod";

import {
  type Authorization,
  evidenceEnvelopeSchema,
} from "../core/bound.js";

import {
  verifyRawErc20Transfer,
} from "../core/evm.js";

import {
  FileEvidenceUseStore,
  gateSigning,
} from "../core/replay.js";

import {
  loadTrustedSource,
} from "../core/trust.js";

const TOOL_URL =
  "http://127.0.0.1:8787";

const SOURCE_ID =
  "market-report-tool";

const RESOURCE_ID =
  "bnb-market-report";

const CHAIN_ID = 97;

const TOKEN =
  "0x3333333333333333333333333333333333333333" as const;

const ATTACKER =
  "0x2222222222222222222222222222222222222222" as const;

const abi =
  parseAbi([
    "function transfer(address to, uint256 amount) returns (bool)",
  ]);

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

            amountRaw:
              z.string(),

            decimals:
              z.number(),
          }),
      }),

    envelope:
      evidenceEnvelopeSchema,
  });

async function getQuote() {
  const response =
    await fetch(
      `${TOOL_URL}/quote`,
      {
        method: "POST",

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
      `Tool returned HTTP ${response.status}`
    );
  }

  const raw =
    await response.json();

  return quoteResponseSchema.parse(
    raw
  );
}

const now =
  Date.now();

/*
 * This authorization is deliberately
 * separate from the tool.
 *
 * The tool cannot decide what the
 * user authorized.
 */
const authorization:
  Authorization = {
    authorizationId:
      "auth-http-demo-001",

    resourceId:
      RESOURCE_ID,

    chainId:
      CHAIN_ID,

    token:
      TOKEN,

    /*
     * 1 TESTUSD assuming 6 decimals.
     */
    maxAmountRaw:
      "1000000",

    trustedSourceId:
      SOURCE_ID,

    validUntil:
      now +
      10 * 60 * 1000,
  };

/*
 * Trust comes from a previously
 * pinned public key.
 *
 * We DO NOT obtain the verification
 * key from the quote response.
 */
const trustedSources =
  await loadTrustedSource({
    sourceId:
      SOURCE_ID,
  });

const quote =
  await getQuote();

const evidence =
  quote.envelope.evidence;

/*
 * Runtime validation + proper viem address type.
 *
 * We do not use a blind TypeScript cast here.
 */
const evidenceRecipient =
  getAddress(
    evidence.recipient
  );

console.log(
  "\n=== EXTERNAL TOOL EVIDENCE ==="
);

console.log(
  JSON.stringify(
    {
      sourceId:
        evidence.sourceId,

      resourceId:
        evidence.resourceId,

      recipient:
        evidence.recipient,

      amountRaw:
        evidence.amountRaw,

      nonce:
        evidence.nonce,
    },
    null,
    2
  )
);

/*
 * Normal proposed transaction.
 *
 * This calldata uses the recipient
 * and amount supplied by the signed
 * external tool evidence.
 */
const normalCalldata =
  encodeFunctionData({
    abi,

    functionName:
      "transfer",

    args: [
      evidenceRecipient,
      BigInt(
        evidence.amountRaw
      ),
    ],
  });

const normalVerification =
  verifyRawErc20Transfer({
    authorization,

    envelope:
      quote.envelope,

    trustedSources,

    now:
      Date.now(),

    rawTransaction: {
      chainId:
        CHAIN_ID,

      to:
        TOKEN,

      data:
        normalCalldata,

      value:
        "0",
    },
  });

console.log(
  "\n=== NORMAL TRANSACTION ==="
);

console.log(
  JSON.stringify(
    normalVerification,
    null,
    2
  )
);

/*
 * Adversarial proposal.
 *
 * Price, token, chain, and resource
 * remain unchanged.
 *
 * Only the recipient in the actual
 * calldata changes.
 */
const poisonedCalldata =
  encodeFunctionData({
    abi,

    functionName:
      "transfer",

    args: [
      ATTACKER,

      BigInt(
        evidence.amountRaw
      ),
    ],
  });

const poisonedVerification =
  verifyRawErc20Transfer({
    authorization,

    envelope:
      quote.envelope,

    trustedSources,

    now:
      Date.now(),

    rawTransaction: {
      chainId:
        CHAIN_ID,

      to:
        TOKEN,

      data:
        poisonedCalldata,

      value:
        "0",
    },
  });

console.log(
  "\n=== POISONED TRANSACTION ==="
);

console.log(
  JSON.stringify(
    poisonedVerification,
    null,
    2
  )
);

if (
  normalVerification.decision !==
  "ALLOW"
) {
  throw new Error(
    "Normal external-tool transaction should ALLOW."
  );
}

if (
  poisonedVerification.decision !==
  "BLOCK"
) {
  throw new Error(
    "Poisoned external-tool transaction should BLOCK."
  );
}

const provenanceBreak =
  poisonedVerification.findings.some(
    (finding) =>
      finding.code ===
      "RECIPIENT_PROVENANCE_BREAK"
  );

if (
  !provenanceBreak
) {
  throw new Error(
    "Poisoned transaction was blocked for the wrong reason."
  );
}

/*
 * Now cross the signing boundary.
 */
const store =
  new FileEvidenceUseStore();

const firstSigningAttempt =
  await gateSigning({
    verification:
      normalVerification,

    store,
  });

console.log(
  "\n=== FIRST SIGNING GATE ==="
);

console.log(
  JSON.stringify(
    firstSigningAttempt,
    null,
    2
  )
);

const replayAttempt =
  await gateSigning({
    verification:
      normalVerification,

    store,
  });

console.log(
  "\n=== REPLAY ATTEMPT ==="
);

console.log(
  JSON.stringify(
    replayAttempt,
    null,
    2
  )
);

if (
  firstSigningAttempt.decision !==
  "ALLOW"
) {
  throw new Error(
    "First signing attempt should ALLOW."
  );
}

if (
  replayAttempt.decision !==
  "BLOCK"
) {
  throw new Error(
    "Replay must BLOCK."
  );
}

if (
  replayAttempt.findings[0]?.code !==
  "EVIDENCE_ALREADY_USED"
) {
  throw new Error(
    "Replay was blocked for the wrong reason."
  );
}

console.log(
  "\nBOUND external-tool invariant passed."
);
