import {
  generateKeyPairSync,
} from "node:crypto";

import assert from "node:assert/strict";

import test from "node:test";

import {
  type NativeAuthorization,
  type NativeEvidence,
  signNativeEvidence,
} from "../src/core/native.js";

import {
  guardAndExecuteNative,
} from "../src/chain/guarded-native-signer.js";

/*
 * =======================================================
 * TEST STORE
 * =======================================================
 */

class TestEvidenceUseStore {
  private readonly used =
    new Set<string>();

  async claim(
    evidenceId:
      string
  ): Promise<boolean> {
    if (
      this.used.has(
        evidenceId
      )
    ) {
      return false;
    }

    this.used.add(
      evidenceId
    );

    return true;
  }
}

/*
 * =======================================================
 * FIXTURES
 * =======================================================
 */

const RECIPIENT_A =
  "0x1111111111111111111111111111111111111111";

const RECIPIENT_B =
  "0x2222222222222222222222222222222222222222";

const now =
  Date.now();

const {
  privateKey,
  publicKey,
} =
  generateKeyPairSync(
    "ed25519"
  );

const PRIVATE_KEY_PEM =
  privateKey
    .export({
      format:
        "pem",

      type:
        "pkcs8",
    })
    .toString();

const PUBLIC_KEY_PEM =
  publicKey
    .export({
      format:
        "pem",

      type:
        "spki",
    })
    .toString();

const SOURCE_ID =
  "native-signer-test-tool";

const authorization:
  NativeAuthorization = {
    authorizationId:
      "signer-auth-001",

    resourceId:
      "bnb-market-report",

    chainId:
      97,

    assetType:
      "native",

    assetSymbol:
      "tBNB",

    /*
     * 0.005 tBNB
     */
    maxAmountWei:
      "5000000000000000",

    trustedSourceId:
      SOURCE_ID,

    validUntil:
      now +
      10 * 60 * 1000,
  };

function createEvidence():
NativeEvidence {
  return {
    sourceId:
      SOURCE_ID,

    resourceId:
      "bnb-market-report",

    chainId:
      97,

    assetType:
      "native",

    assetSymbol:
      "tBNB",

    recipient:
      RECIPIENT_A,

    /*
     * 0.001 tBNB
     */
    amountWei:
      "1000000000000000",

    nonce:
      "guarded-signer-test",

    issuedAt:
      now,

    expiresAt:
      now +
      5 * 60 * 1000,
  };
}

function createEnvelope() {
  return signNativeEvidence(
    createEvidence(),
    PRIVATE_KEY_PEM
  );
}

const trustedSources = {
  [SOURCE_ID]:
    PUBLIC_KEY_PEM,
};

/*
 * =======================================================
 * TEST: VALID TRANSACTION EXECUTES
 * =======================================================
 */

test(
  "guarded signer executes only after native verification allows",
  async () => {
    let executionCount = 0;

    const result =
      await guardAndExecuteNative({
        authorization,

        envelope:
          createEnvelope(),

        trustedSources,

        transaction: {
          chainId:
            97,

          to:
            RECIPIENT_A,

          valueWei:
            "1000000000000000",

          data:
            "0x",
        },

        store:
          new TestEvidenceUseStore(),

        now:
          now + 1_000,

        execute:
          async () => {
            executionCount += 1;

            return {
              simulatedHash:
                "0xvalid",
            };
          },
      });

    assert.equal(
      result.status,
      "EXECUTED"
    );

    assert.equal(
      result.executed,
      true
    );

    assert.equal(
      executionCount,
      1
    );

    assert.equal(
      result.gate.decision,
      "ALLOW"
    );
  }
);

/*
 * =======================================================
 * TEST: POISONED RECIPIENT NEVER EXECUTES
 * =======================================================
 */

test(
  "guarded signer never calls executor for poisoned recipient",
  async () => {
    let executionCount = 0;

    const result =
      await guardAndExecuteNative({
        authorization,

        envelope:
          createEnvelope(),

        trustedSources,

        transaction: {
          chainId:
            97,

          to:
            RECIPIENT_B,

          valueWei:
            "1000000000000000",

          data:
            "0x",
        },

        store:
          new TestEvidenceUseStore(),

        now:
          now + 1_000,

        execute:
          async () => {
            executionCount += 1;

            return {
              simulatedHash:
                "SHOULD_NOT_EXIST",
            };
          },
      });

    assert.equal(
      result.status,
      "BLOCKED"
    );

    assert.equal(
      result.executed,
      false
    );

    assert.equal(
      executionCount,
      0
    );

    assert.equal(
      result.verification
        .decision,
      "BLOCK"
    );

    assert.equal(
      result.verification
        .findings[0]
        ?.code,
      "RECIPIENT_PROVENANCE_BREAK"
    );
  }
);

/*
 * =======================================================
 * TEST: REPLAY NEVER EXECUTES TWICE
 * =======================================================
 */

test(
  "guarded signer executes evidence at most once",
  async () => {
    const store =
      new TestEvidenceUseStore();

    const envelope =
      createEnvelope();

    let executionCount = 0;

    const transaction = {
      chainId:
        97,

      to:
        RECIPIENT_A,

      valueWei:
        "1000000000000000",

      data:
        "0x",
    };

    const first =
      await guardAndExecuteNative({
        authorization,

        envelope,

        trustedSources,

        transaction,

        store,

        now:
          now + 1_000,

        execute:
          async () => {
            executionCount += 1;

            return {
              attempt:
                1,
            };
          },
      });

    const second =
      await guardAndExecuteNative({
        authorization,

        envelope,

        trustedSources,

        transaction,

        store,

        now:
          now + 2_000,

        execute:
          async () => {
            executionCount += 1;

            return {
              attempt:
                2,
            };
          },
      });

    assert.equal(
      first.status,
      "EXECUTED"
    );

    assert.equal(
      second.status,
      "BLOCKED"
    );

    assert.equal(
      executionCount,
      1
    );

    assert.equal(
      second.gate
        .findings[0]
        ?.code,
      "EVIDENCE_ALREADY_USED"
    );
  }
);
