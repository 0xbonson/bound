import { sign, verify } from "node:crypto";
import { isAddress, keccak256, stringToHex } from "viem";
import { z } from "zod";

const uintString = z
  .string()
  .regex(/^(0|[1-9]\d*)$/, "Expected an unsigned integer string");

const evmAddress = z
  .string()
  .refine((value) => isAddress(value), "Invalid EVM address")
  .transform((value) => value.toLowerCase());

export const authorizationSchema = z.object({
  authorizationId: z.string().min(1),
  resourceId: z.string().min(1),
  chainId: z.number().int().positive(),
  token: evmAddress,
  maxAmountRaw: uintString,
  trustedSourceId: z.string().min(1),
  validUntil: z.number().int().positive(),
});

export const evidenceSchema = z.object({
  sourceId: z.string().min(1),
  resourceId: z.string().min(1),
  chainId: z.number().int().positive(),
  token: evmAddress,
  recipient: evmAddress,
  amountRaw: uintString,
  nonce: z.string().min(1),
  issuedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
});

export const evidenceEnvelopeSchema = z.object({
  evidence: evidenceSchema,
  signatureBase64: z.string().min(1),
});

export const proposedTransactionSchema = z.object({
  resourceId: z.string().min(1),
  evidenceId: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  chainId: z.number().int().positive(),
  token: evmAddress,
  recipient: evmAddress,
  amountRaw: uintString,
});

export type Authorization = z.infer<typeof authorizationSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type EvidenceEnvelope = z.infer<typeof evidenceEnvelopeSchema>;
export type ProposedTransaction = z.infer<typeof proposedTransactionSchema>;

export type Decision =
  | "ALLOW"
  | "BLOCK"
  | "NEEDS_REAUTHORIZATION";

export type Finding = {
  code: string;
  message: string;
  expected?: string;
  actual?: string;
};

export type VerificationResult = {
  decision: Decision;
  evidenceId?: string;
  findings: Finding[];
};

export type TrustedSources = Record<string, string>;

function canonicalEvidence(evidence: Evidence): string {
  return JSON.stringify([
    "bound.evidence.v1",
    evidence.sourceId,
    evidence.resourceId,
    evidence.chainId,
    evidence.token.toLowerCase(),
    evidence.recipient.toLowerCase(),
    evidence.amountRaw,
    evidence.nonce,
    evidence.issuedAt,
    evidence.expiresAt,
  ]);
}

export function getEvidenceId(evidence: Evidence): string {
  return keccak256(stringToHex(canonicalEvidence(evidence)));
}

export function signEvidence(
  evidenceInput: Evidence,
  privateKeyPem: string
): EvidenceEnvelope {
  const evidence = evidenceSchema.parse(evidenceInput);

  const signature = sign(
    null,
    Buffer.from(canonicalEvidence(evidence)),
    privateKeyPem
  );

  return {
    evidence,
    signatureBase64: signature.toString("base64"),
  };
}

function mismatch(
  code: string,
  message: string,
  expected?: string,
  actual?: string
): Finding {
  return {
    code,
    message,
    ...(expected !== undefined ? { expected } : {}),
    ...(actual !== undefined ? { actual } : {}),
  };
}

export function verifyTransaction(input: {
  authorization: Authorization;
  envelope: EvidenceEnvelope;
  transaction: ProposedTransaction;
  trustedSources: TrustedSources;
  now?: number;
}): VerificationResult {
  const authorizationResult =
    authorizationSchema.safeParse(input.authorization);

  const envelopeResult =
    evidenceEnvelopeSchema.safeParse(input.envelope);

  const transactionResult =
    proposedTransactionSchema.safeParse(input.transaction);

  if (
    !authorizationResult.success ||
    !envelopeResult.success ||
    !transactionResult.success
  ) {
    return {
      decision: "BLOCK",
      findings: [
        mismatch(
          "INVALID_INPUT",
          "Authorization, evidence, or transaction failed schema validation."
        ),
      ],
    };
  }

  const authorization = authorizationResult.data;
  const envelope = envelopeResult.data;
  const evidence = envelope.evidence;
  const transaction = transactionResult.data;
  const now = input.now ?? Date.now();

  const evidenceId = getEvidenceId(evidence);

  if (authorization.validUntil < now) {
    return {
      decision: "NEEDS_REAUTHORIZATION",
      evidenceId,
      findings: [
        mismatch(
          "AUTHORIZATION_EXPIRED",
          "The user's authorization has expired."
        ),
      ],
    };
  }

  if (evidence.expiresAt < now) {
    return {
      decision: "NEEDS_REAUTHORIZATION",
      evidenceId,
      findings: [
        mismatch(
          "EVIDENCE_EXPIRED",
          "The tool evidence is stale and must be refreshed."
        ),
      ],
    };
  }

  if (evidence.issuedAt > now + 60_000) {
    return {
      decision: "BLOCK",
      evidenceId,
      findings: [
        mismatch(
          "INVALID_EVIDENCE_TIME",
          "The evidence claims to have been issued too far in the future."
        ),
      ],
    };
  }

  const publicKey = input.trustedSources[evidence.sourceId];

  if (!publicKey) {
    return {
      decision: "BLOCK",
      evidenceId,
      findings: [
        mismatch(
          "UNTRUSTED_EVIDENCE_SOURCE",
          "BOUND has no trusted public key for this evidence source."
        ),
      ],
    };
  }

  const signatureValid = verify(
    null,
    Buffer.from(canonicalEvidence(evidence)),
    publicKey,
    Buffer.from(envelope.signatureBase64, "base64")
  );

  if (!signatureValid) {
    return {
      decision: "BLOCK",
      evidenceId,
      findings: [
        mismatch(
          "INVALID_EVIDENCE_SIGNATURE",
          "The evidence signature is invalid."
        ),
      ],
    };
  }

  if (evidence.sourceId !== authorization.trustedSourceId) {
    return {
      decision: "NEEDS_REAUTHORIZATION",
      evidenceId,
      findings: [
        mismatch(
          "SOURCE_NOT_AUTHORIZED",
          "The evidence came from a source not covered by the user's authorization.",
          authorization.trustedSourceId,
          evidence.sourceId
        ),
      ],
    };
  }

  const authorizationFindings: Finding[] = [];

  if (evidence.resourceId !== authorization.resourceId) {
    authorizationFindings.push(
      mismatch(
        "RESOURCE_NOT_AUTHORIZED",
        "The resource differs from the resource authorized by the user.",
        authorization.resourceId,
        evidence.resourceId
      )
    );
  }

  if (evidence.chainId !== authorization.chainId) {
    authorizationFindings.push(
      mismatch(
        "CHAIN_NOT_AUTHORIZED",
        "The evidence refers to a different chain.",
        String(authorization.chainId),
        String(evidence.chainId)
      )
    );
  }

  if (evidence.token !== authorization.token) {
    authorizationFindings.push(
      mismatch(
        "TOKEN_NOT_AUTHORIZED",
        "The evidence refers to a different token.",
        authorization.token,
        evidence.token
      )
    );
  }

  if (BigInt(evidence.amountRaw) > BigInt(authorization.maxAmountRaw)) {
    authorizationFindings.push(
      mismatch(
        "AMOUNT_EXCEEDS_AUTHORIZATION",
        "The requested amount exceeds the user's authorized maximum.",
        authorization.maxAmountRaw,
        evidence.amountRaw
      )
    );
  }

  if (authorizationFindings.length > 0) {
    return {
      decision: "NEEDS_REAUTHORIZATION",
      evidenceId,
      findings: authorizationFindings,
    };
  }

  const transactionFindings: Finding[] = [];

  if (transaction.evidenceId !== evidenceId) {
    transactionFindings.push(
      mismatch(
        "EVIDENCE_BINDING_MISMATCH",
        "The proposed transaction references different evidence.",
        evidenceId,
        transaction.evidenceId
      )
    );
  }

  if (transaction.resourceId !== evidence.resourceId) {
    transactionFindings.push(
      mismatch(
        "RESOURCE_PROVENANCE_BREAK",
        "The transaction resource differs from the signed evidence.",
        evidence.resourceId,
        transaction.resourceId
      )
    );
  }

  if (transaction.chainId !== evidence.chainId) {
    transactionFindings.push(
      mismatch(
        "CHAIN_PROVENANCE_BREAK",
        "The transaction chain differs from the signed evidence.",
        String(evidence.chainId),
        String(transaction.chainId)
      )
    );
  }

  if (transaction.token !== evidence.token) {
    transactionFindings.push(
      mismatch(
        "TOKEN_PROVENANCE_BREAK",
        "The transaction token differs from the signed evidence.",
        evidence.token,
        transaction.token
      )
    );
  }

  if (transaction.recipient !== evidence.recipient) {
    transactionFindings.push(
      mismatch(
        "RECIPIENT_PROVENANCE_BREAK",
        "The transaction recipient differs from the signed evidence.",
        evidence.recipient,
        transaction.recipient
      )
    );
  }

  if (transaction.amountRaw !== evidence.amountRaw) {
    transactionFindings.push(
      mismatch(
        "AMOUNT_PROVENANCE_BREAK",
        "The transaction amount differs from the signed evidence.",
        evidence.amountRaw,
        transaction.amountRaw
      )
    );
  }

  if (transactionFindings.length > 0) {
    return {
      decision: "BLOCK",
      evidenceId,
      findings: transactionFindings,
    };
  }

  return {
    decision: "ALLOW",
    evidenceId,
    findings: [
      mismatch(
        "PROVENANCE_VERIFIED",
        "Transaction-critical fields match the signed evidence and user authorization."
      ),
    ],
  };
}
