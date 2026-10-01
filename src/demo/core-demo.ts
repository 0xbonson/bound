import { generateKeyPairSync } from "node:crypto";

import {
  type Authorization,
  type Evidence,
  getEvidenceId,
  signEvidence,
  verifyTransaction,
} from "../core/bound.js";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");

const publicKeyPem = publicKey.export({
  type: "spki",
  format: "pem",
}).toString();

const privateKeyPem = privateKey.export({
  type: "pkcs8",
  format: "pem",
}).toString();

const TOKEN =
  "0x3333333333333333333333333333333333333333";

const RECIPIENT_A =
  "0x1111111111111111111111111111111111111111";

const RECIPIENT_B =
  "0x2222222222222222222222222222222222222222";

const now = Date.now();

const authorization: Authorization = {
  authorizationId: "auth-001",
  resourceId: "bnb-market-report",
  chainId: 97,
  token: TOKEN,
  maxAmountRaw: "1000000",
  trustedSourceId: "market-tool",
  validUntil: now + 10 * 60 * 1000,
};

const evidence: Evidence = {
  sourceId: "market-tool",
  resourceId: "bnb-market-report",
  chainId: 97,
  token: TOKEN,
  recipient: RECIPIENT_A,
  amountRaw: "250000",
  nonce: "quote-001",
  issuedAt: now,
  expiresAt: now + 5 * 60 * 1000,
};

const envelope = signEvidence(evidence, privateKeyPem);
const evidenceId = getEvidenceId(evidence);

const trustedSources = {
  "market-tool": publicKeyPem,
};

const normalTransaction = {
  resourceId: "bnb-market-report",
  evidenceId,
  chainId: 97,
  token: TOKEN,
  recipient: RECIPIENT_A,
  amountRaw: "250000",
};

const poisonedTransaction = {
  ...normalTransaction,
  recipient: RECIPIENT_B,
};

const normal = verifyTransaction({
  authorization,
  envelope,
  transaction: normalTransaction,
  trustedSources,
  now,
});

const poisoned = verifyTransaction({
  authorization,
  envelope,
  transaction: poisonedTransaction,
  trustedSources,
  now,
});

console.log("\n=== NORMAL SCENARIO ===");
console.log(JSON.stringify(normal, null, 2));

console.log("\n=== POISONED SCENARIO ===");
console.log(JSON.stringify(poisoned, null, 2));

if (normal.decision !== "ALLOW") {
  throw new Error("Normal scenario should ALLOW");
}

if (poisoned.decision !== "BLOCK") {
  throw new Error("Poisoned scenario should BLOCK");
}

console.log("\nBOUND core invariant passed.");
