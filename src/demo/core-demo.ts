import { generateKeyPairSync } from "node:crypto";

import {
  encodeFunctionData,
  parseAbi,
} from "viem";

import {
  type Authorization,
  type Evidence,
  signEvidence,
} from "../core/bound.js";

import {
  verifyRawErc20Transfer,
} from "../core/evm.js";

const { publicKey, privateKey } =
  generateKeyPairSync("ed25519");

const publicKeyPem = publicKey
  .export({
    type: "spki",
    format: "pem",
  })
  .toString();

const privateKeyPem = privateKey
  .export({
    type: "pkcs8",
    format: "pem",
  })
  .toString();

const TOKEN =
  "0x3333333333333333333333333333333333333333";

const RECIPIENT_A =
  "0x1111111111111111111111111111111111111111";

const RECIPIENT_B =
  "0x2222222222222222222222222222222222222222";

const erc20Abi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
]);

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

const envelope =
  signEvidence(evidence, privateKeyPem);

const trustedSources = {
  "market-tool": publicKeyPem,
};

/*
 * NORMAL:
 *
 * Signed evidence says:
 *   recipient A
 *   250000 units
 *
 * Actual calldata says exactly the same thing.
 */
const normalCalldata = encodeFunctionData({
  abi: erc20Abi,
  functionName: "transfer",
  args: [RECIPIENT_A, 250000n],
});

const normal = verifyRawErc20Transfer({
  authorization,
  envelope,
  trustedSources,
  now,
  rawTransaction: {
    chainId: 97,
    to: TOKEN,
    data: normalCalldata,
    value: "0",
  },
});

/*
 * POISONED:
 *
 * Signed evidence still says recipient A.
 *
 * The actual calldata has been changed so the
 * token transfer now goes to recipient B.
 *
 * Budget remains the same.
 * Token remains the same.
 * Chain remains the same.
 *
 * A simple spend limit would not catch this.
 */
const poisonedCalldata = encodeFunctionData({
  abi: erc20Abi,
  functionName: "transfer",
  args: [RECIPIENT_B, 250000n],
});

const poisoned = verifyRawErc20Transfer({
  authorization,
  envelope,
  trustedSources,
  now,
  rawTransaction: {
    chainId: 97,
    to: TOKEN,
    data: poisonedCalldata,
    value: "0",
  },
});

console.log("\n=== NORMAL RAW TRANSACTION ===");
console.log(JSON.stringify(normal, null, 2));

console.log("\n=== POISONED RAW TRANSACTION ===");
console.log(JSON.stringify(poisoned, null, 2));

if (normal.decision !== "ALLOW") {
  throw new Error(
    "Normal raw transaction should ALLOW."
  );
}

if (poisoned.decision !== "BLOCK") {
  throw new Error(
    "Poisoned raw transaction should BLOCK."
  );
}

const recipientFinding =
  poisoned.findings.find(
    (finding) =>
      finding.code ===
      "RECIPIENT_PROVENANCE_BREAK"
  );

if (!recipientFinding) {
  throw new Error(
    "Poisoned transaction was blocked for the wrong reason."
  );
}

console.log(
  "\nBOUND raw-calldata invariant passed."
);
