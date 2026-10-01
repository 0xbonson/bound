import {
  sign as nodeSign,
  verify as nodeVerify,
} from "node:crypto";

import {
  isAddress,
  keccak256,
  stringToHex,
} from "viem";

import {
  z,
} from "zod";

import {
  type TrustedSources,
  type VerificationResult,
} from "./bound.js";

/*
 * =======================================================
 * HELPERS
 * =======================================================
 */

const unsignedIntegerString =
  z.string().regex(
    /^(0|[1-9]\d*)$/,
    "Expected an unsigned integer string."
  );

const evmAddress =
  z.string()
    .refine(
      (value) =>
        isAddress(value),
      "Expected a valid EVM address."
    )
    .transform(
      (value) =>
        value.toLowerCase()
    );

/*
 * =======================================================
 * NATIVE USER AUTHORIZATION
 * =======================================================
 */

export const nativeAuthorizationSchema =
  z.object({
    authorizationId:
      z.string().min(1),

    resourceId:
      z.string().min(1),

    chainId:
      z.number()
        .int()
        .positive(),

    assetType:
      z.literal("native"),

    assetSymbol:
      z.string().min(1),

    maxAmountWei:
      unsignedIntegerString,

    trustedSourceId:
      z.string().min(1),

    validUntil:
      z.number()
        .int()
        .positive(),
  });

export type NativeAuthorization =
  z.infer<
    typeof nativeAuthorizationSchema
  >;

/*
 * =======================================================
 * SIGNED EVIDENCE
 * =======================================================
 */

export const nativeEvidenceSchema =
  z.object({
    sourceId:
      z.string().min(1),

    resourceId:
      z.string().min(1),

    chainId:
      z.number()
        .int()
        .positive(),

    assetType:
      z.literal("native"),

    assetSymbol:
      z.string().min(1),

    recipient:
      evmAddress,

    amountWei:
      unsignedIntegerString,

    nonce:
      z.string().min(1),

    issuedAt:
      z.number()
        .int()
        .positive(),

    expiresAt:
      z.number()
        .int()
        .positive(),
  });

export type NativeEvidence =
  z.infer<
    typeof nativeEvidenceSchema
  >;

export const nativeEvidenceEnvelopeSchema =
  z.object({
    evidence:
      nativeEvidenceSchema,

    signatureBase64:
      z.string().min(1),
  });

export type NativeEvidenceEnvelope =
  z.infer<
    typeof nativeEvidenceEnvelopeSchema
  >;

/*
 * =======================================================
 * RAW NATIVE TRANSACTION
 * =======================================================
 *
 * BOUND verifies what would actually reach
 * the wallet signer.
 *
 * Native BNB transfer:
 *
 * chainId
 * to
 * value
 * data = 0x
 */

export const rawNativeTransactionSchema =
  z.object({
    chainId:
      z.number()
        .int()
        .positive(),

    to:
      evmAddress,

    valueWei:
      unsignedIntegerString,

    data:
      z.string(),
  });

export type RawNativeTransaction =
  z.infer<
    typeof rawNativeTransactionSchema
  >;

/*
 * =======================================================
 * CANONICALIZATION
 * =======================================================
 */

export function canonicalNativeEvidence(
  evidence:
    NativeEvidence
): string {
  const parsed =
    nativeEvidenceSchema.parse(
      evidence
    );

  /*
   * Array ordering is deliberate.
   *
   * We avoid relying on arbitrary
   * object property ordering.
   */
  return JSON.stringify([
    "bound.native.evidence.v1",

    parsed.sourceId,
    parsed.resourceId,
    parsed.chainId,
    parsed.assetType,
    parsed.assetSymbol,
    parsed.recipient,
    parsed.amountWei,
    parsed.nonce,
    parsed.issuedAt,
    parsed.expiresAt,
  ]);
}

export function getNativeEvidenceId(
  evidence:
    NativeEvidence
): `0x${string}` {
  return keccak256(
    stringToHex(
      canonicalNativeEvidence(
        evidence
      )
    )
  );
}

/*
 * =======================================================
 * SIGN / VERIFY EVIDENCE
 * =======================================================
 */

export function signNativeEvidence(
  evidence:
    NativeEvidence,
  privateKeyPem:
    string
): NativeEvidenceEnvelope {
  const parsedEvidence =
    nativeEvidenceSchema.parse(
      evidence
    );

  const payload =
    Buffer.from(
      canonicalNativeEvidence(
        parsedEvidence
      ),
      "utf8"
    );

  const signature =
    nodeSign(
      null,
      payload,
      privateKeyPem
    );

  return {
    evidence:
      parsedEvidence,

    signatureBase64:
      signature.toString(
        "base64"
      ),
  };
}

function verifyNativeEvidenceSignature(
  envelope:
    NativeEvidenceEnvelope,
  publicKeyPem:
    string
): boolean {
  try {
    const payload =
      Buffer.from(
        canonicalNativeEvidence(
          envelope.evidence
        ),
        "utf8"
      );

    const signature =
      Buffer.from(
        envelope.signatureBase64,
        "base64"
      );

    return nodeVerify(
      null,
      payload,
      publicKeyPem,
      signature
    );
  } catch {
    return false;
  }
}

/*
 * =======================================================
 * VERIFIER
 * =======================================================
 */

export function verifyRawNativeTransfer(input: {
  authorization:
    NativeAuthorization;

  envelope:
    NativeEvidenceEnvelope;

  trustedSources:
    TrustedSources;

  rawTransaction:
    RawNativeTransaction;

  now?: number;
}): VerificationResult {
  const now =
    input.now ??
    Date.now();

  const authorizationResult =
    nativeAuthorizationSchema
      .safeParse(
        input.authorization
      );

  if (
    !authorizationResult.success
  ) {
    return {
      decision:
        "BLOCK",

      findings: [
        {
          code:
            "INVALID_AUTHORIZATION",

          message:
            "Native authorization is malformed.",
        },
      ],
    };
  }

  const envelopeResult =
    nativeEvidenceEnvelopeSchema
      .safeParse(
        input.envelope
      );

  if (
    !envelopeResult.success
  ) {
    return {
      decision:
        "BLOCK",

      findings: [
        {
          code:
            "INVALID_EVIDENCE",

          message:
            "Native evidence envelope is malformed.",
        },
      ],
    };
  }

  const transactionResult =
    rawNativeTransactionSchema
      .safeParse(
        input.rawTransaction
      );

  if (
    !transactionResult.success
  ) {
    return {
      decision:
        "BLOCK",

      findings: [
        {
          code:
            "INVALID_NATIVE_TRANSACTION",

          message:
            "Native transaction is malformed.",
        },
      ],
    };
  }

  const authorization =
    authorizationResult.data;

  const envelope =
    envelopeResult.data;

  const evidence =
    envelope.evidence;

  const transaction =
    transactionResult.data;

  const evidenceId =
    getNativeEvidenceId(
      evidence
    );

  /*
   * ---------------------------------------------------
   * AUTHORIZATION FRESHNESS
   * ---------------------------------------------------
   */

  if (
    authorization.validUntil <=
    now
  ) {
    return {
      decision:
        "NEEDS_REAUTHORIZATION",

      evidenceId,

      findings: [
        {
          code:
            "AUTHORIZATION_EXPIRED",

          message:
            "The user authorization has expired.",
        },
      ],
    };
  }

  /*
   * ---------------------------------------------------
   * EVIDENCE TIME
   * ---------------------------------------------------
   */

  if (
    evidence.expiresAt <=
    now
  ) {
    return {
      decision:
        "NEEDS_REAUTHORIZATION",

      evidenceId,

      findings: [
        {
          code:
            "EVIDENCE_EXPIRED",

          message:
            "The signed evidence has expired.",
        },
      ],
    };
  }

  if (
    evidence.issuedAt >=
    evidence.expiresAt
  ) {
    return {
      decision:
        "BLOCK",

      evidenceId,

      findings: [
        {
          code:
            "INVALID_EVIDENCE_TIME",

          message:
            "Evidence expiry must be later than issuance.",
        },
      ],
    };
  }

  if (
    evidence.issuedAt >
    now + 60_000
  ) {
    return {
      decision:
        "BLOCK",

      evidenceId,

      findings: [
        {
          code:
            "INVALID_EVIDENCE_TIME",

          message:
            "Evidence issuance time is unreasonably far in the future.",
        },
      ],
    };
  }

  /*
   * ---------------------------------------------------
   * TRUST ROOT
   * ---------------------------------------------------
   */

  const trustedPublicKey =
    input.trustedSources[
      evidence.sourceId
    ];

  if (
    !trustedPublicKey
  ) {
    return {
      decision:
        "BLOCK",

      evidenceId,

      findings: [
        {
          code:
            "UNTRUSTED_EVIDENCE_SOURCE",

          message:
            "No pinned public key exists for this evidence source.",
        },
      ],
    };
  }

  if (
    !verifyNativeEvidenceSignature(
      envelope,
      trustedPublicKey
    )
  ) {
    return {
      decision:
        "BLOCK",

      evidenceId,

      findings: [
        {
          code:
            "INVALID_EVIDENCE_SIGNATURE",

          message:
            "The native payment evidence signature is invalid.",
        },
      ],
    };
  }

  /*
   * ---------------------------------------------------
   * USER AUTHORIZATION VS SIGNED EVIDENCE
   * ---------------------------------------------------
   */

  if (
    evidence.sourceId !==
    authorization.trustedSourceId
  ) {
    return {
      decision:
        "NEEDS_REAUTHORIZATION",

      evidenceId,

      findings: [
        {
          code:
            "SOURCE_NOT_AUTHORIZED",

          message:
            "The evidence source is not authorized by the user.",
        },
      ],
    };
  }

  if (
    evidence.resourceId !==
    authorization.resourceId
  ) {
    return {
      decision:
        "NEEDS_REAUTHORIZATION",

      evidenceId,

      findings: [
        {
          code:
            "RESOURCE_NOT_AUTHORIZED",

          message:
            "The quoted resource differs from the user authorization.",
        },
      ],
    };
  }

  if (
    evidence.chainId !==
    authorization.chainId
  ) {
    return {
      decision:
        "NEEDS_REAUTHORIZATION",

      evidenceId,

      findings: [
        {
          code:
            "CHAIN_NOT_AUTHORIZED",

          message:
            "The quoted chain differs from the user authorization.",
        },
      ],
    };
  }

  if (
    evidence.assetType !==
    authorization.assetType
  ) {
    return {
      decision:
        "NEEDS_REAUTHORIZATION",

      evidenceId,

      findings: [
        {
          code:
            "ASSET_TYPE_NOT_AUTHORIZED",

          message:
            "The payment asset type differs from the user authorization.",
        },
      ],
    };
  }

  if (
    evidence.assetSymbol !==
    authorization.assetSymbol
  ) {
    return {
      decision:
        "NEEDS_REAUTHORIZATION",

      evidenceId,

      findings: [
        {
          code:
            "ASSET_NOT_AUTHORIZED",

          message:
            "The payment asset differs from the user authorization.",
        },
      ],
    };
  }

  if (
    BigInt(
      evidence.amountWei
    ) >
    BigInt(
      authorization.maxAmountWei
    )
  ) {
    return {
      decision:
        "NEEDS_REAUTHORIZATION",

      evidenceId,

      findings: [
        {
          code:
            "AMOUNT_EXCEEDS_AUTHORIZATION",

          message:
            "The signed payment amount exceeds the user's authorized maximum.",

          expected:
            authorization.maxAmountWei,

          actual:
            evidence.amountWei,
        },
      ],
    };
  }

  /*
   * ---------------------------------------------------
   * RAW TRANSACTION SHAPE
   * ---------------------------------------------------
   */

  if (
    transaction.data !==
    "0x"
  ) {
    return {
      decision:
        "BLOCK",

      evidenceId,

      findings: [
        {
          code:
            "UNEXPECTED_NATIVE_CALLDATA",

          message:
            "A plain native payment must not contain executable calldata.",

          expected:
            "0x",

          actual:
            transaction.data,
        },
      ],
    };
  }

  /*
   * ---------------------------------------------------
   * RAW TRANSACTION VS SIGNED EVIDENCE
   * ---------------------------------------------------
   */

  if (
    transaction.chainId !==
    evidence.chainId
  ) {
    return {
      decision:
        "BLOCK",

      evidenceId,

      findings: [
        {
          code:
            "CHAIN_PROVENANCE_BREAK",

          message:
            "The transaction chain differs from the signed evidence.",

          expected:
            String(
              evidence.chainId
            ),

          actual:
            String(
              transaction.chainId
            ),
        },
      ],
    };
  }

  if (
    transaction.to !==
    evidence.recipient
  ) {
    return {
      decision:
        "BLOCK",

      evidenceId,

      findings: [
        {
          code:
            "RECIPIENT_PROVENANCE_BREAK",

          message:
            "The native transaction recipient differs from the signed evidence.",

          expected:
            evidence.recipient,

          actual:
            transaction.to,
        },
      ],
    };
  }

  if (
    transaction.valueWei !==
    evidence.amountWei
  ) {
    return {
      decision:
        "BLOCK",

      evidenceId,

      findings: [
        {
          code:
            "AMOUNT_PROVENANCE_BREAK",

          message:
            "The native transaction value differs from the signed evidence.",

          expected:
            evidence.amountWei,

          actual:
            transaction.valueWei,
        },
      ],
    };
  }

  return {
    decision:
      "ALLOW",

    evidenceId,

    findings: [
      {
        code:
          "PROVENANCE_VERIFIED",

        message:
          "Native transaction-critical fields match the signed evidence and user authorization.",
      },
    ],
  };
}
