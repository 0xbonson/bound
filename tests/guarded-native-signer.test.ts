import {
  generateKeyPairSync,
} from "node:crypto";

import assert from "node:assert/strict";

import test from "node:test";

import {
  generatePrivateKey,
  privateKeyToAccount,
} from "viem/accounts";

import {
  type NativeAuthorization,
  type NativeEvidence,
  signNativeEvidence,
} from "../src/core/native.js";

import {
  signNativeAuthorization,
} from "../src/core/native-authorization.js";

import {
  guardAndExecuteNative,
} from "../src/chain/guarded-native-signer.js";

/*
 * =======================================================
 * TEST REPLAY STORE
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

const SOURCE_ID =
  "native-signer-test-tool";

const now =
  Date.now();

/*
 * -------------------------------------------------------
 * USER AUTHORIZATION IDENTITY
 * -------------------------------------------------------
 */

const TRUSTED_USER_PRIVATE_KEY =
  generatePrivateKey();

const TRUSTED_USER_ACCOUNT =
  privateKeyToAccount(
    TRUSTED_USER_PRIVATE_KEY
  );

const ATTACKER_USER_PRIVATE_KEY =
  generatePrivateKey();

/*
 * -------------------------------------------------------
 * TOOL ED25519 IDENTITY
 * -------------------------------------------------------
 */

const {
  privateKey:
    toolPrivateKey,

  publicKey:
    toolPublicKey,
} =
  generateKeyPairSync(
    "ed25519"
  );

const TOOL_PRIVATE_KEY_PEM =
  toolPrivateKey
    .export({
      format:
        "pem",

      type:
        "pkcs8",
    })
    .toString();

const TOOL_PUBLIC_KEY_PEM =
  toolPublicKey
    .export({
      format:
        "pem",

      type:
        "spki",
    })
    .toString();

const trustedSources = {
  [SOURCE_ID]:
    TOOL_PUBLIC_KEY_PEM,
};

/*
 * =======================================================
 * USER AUTHORIZATION
 * =======================================================
 */

function createAuthorization():
NativeAuthorization {
  return {
    authorizationId:
      "guarded-signer-auth-001",

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
}

async function createSignedAuthorization(
  privateKey:
    `0x${string}` =
      TRUSTED_USER_PRIVATE_KEY
) {
  return signNativeAuthorization({
    authorization:
      createAuthorization(),

    privateKey,
  });
}

/*
 * =======================================================
 * TOOL EVIDENCE
 * =======================================================
 */

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
      "guarded-signer-evidence-001",

    issuedAt:
      now,

    expiresAt:
      now +
      5 * 60 * 1000,
  };
}

function createEvidenceEnvelope() {
  return signNativeEvidence(
    createEvidence(),
    TOOL_PRIVATE_KEY_PEM
  );
}

/*
 * =======================================================
 * VALID USER + VALID TRANSACTION
 * =======================================================
 */

test(
  "guarded signer executes only after signed user authorization and transaction verification succeed",
  async () => {
    const signedAuthorization =
      await createSignedAuthorization();

    let executionCount = 0;

    const result =
      await guardAndExecuteNative({
        signedAuthorization,

        expectedAuthorizationSigner:
          TRUSTED_USER_ACCOUNT.address,

        envelope:
          createEvidenceEnvelope(),

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
      result.authorizationVerification
        .valid,
      true
    );

    assert.equal(
      result.gate.decision,
      "ALLOW"
    );
  }
);

/*
 * =======================================================
 * TAMPERED USER AUTHORIZATION
 * =======================================================
 */

test(
  "guarded signer never executes authorization mutated after user signing",
  async () => {
    const signedAuthorization =
      await createSignedAuthorization();

    const tamperedAuthorization = {
      ...signedAuthorization,

      authorization: {
        ...signedAuthorization
          .authorization,

        /*
         * Attacker increases user limit.
         */
        maxAmountWei:
          "500000000000000000",
      },
    };

    let executionCount = 0;

    const result =
      await guardAndExecuteNative({
        signedAuthorization:
          tamperedAuthorization,

        expectedAuthorizationSigner:
          TRUSTED_USER_ACCOUNT.address,

        envelope:
          createEvidenceEnvelope(),

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
              impossible:
                true,
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
        .findings[0]
        ?.code,
      "INVALID_AUTHORIZATION_SIGNATURE"
    );
  }
);

/*
 * =======================================================
 * ATTACKER SELF-AUTHORIZATION
 * =======================================================
 */

test(
  "guarded signer never executes authorization signed by an untrusted user wallet",
  async () => {
    const attackerAuthorization =
      await createSignedAuthorization(
        ATTACKER_USER_PRIVATE_KEY
      );

    let executionCount = 0;

    const result =
      await guardAndExecuteNative({
        signedAuthorization:
          attackerAuthorization,

        expectedAuthorizationSigner:
          TRUSTED_USER_ACCOUNT.address,

        envelope:
          createEvidenceEnvelope(),

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
              impossible:
                true,
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
        .findings[0]
        ?.code,
      "UNAUTHORIZED_AUTHORIZATION_SIGNER"
    );
  }
);

/*
 * =======================================================
 * POISONED RECIPIENT
 * =======================================================
 */

test(
  "guarded signer never calls executor for poisoned recipient",
  async () => {
    const signedAuthorization =
      await createSignedAuthorization();

    let executionCount = 0;

    const result =
      await guardAndExecuteNative({
        signedAuthorization,

        expectedAuthorizationSigner:
          TRUSTED_USER_ACCOUNT.address,

        envelope:
          createEvidenceEnvelope(),

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
              impossible:
                true,
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
 * REPLAY
 * =======================================================
 */

test(
  "guarded signer executes one signed evidence at most once",
  async () => {
    const signedAuthorization =
      await createSignedAuthorization();

    const evidenceEnvelope =
      createEvidenceEnvelope();

    const store =
      new TestEvidenceUseStore();

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
        signedAuthorization,

        expectedAuthorizationSigner:
          TRUSTED_USER_ACCOUNT.address,

        envelope:
          evidenceEnvelope,

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
        signedAuthorization,

        expectedAuthorizationSigner:
          TRUSTED_USER_ACCOUNT.address,

        envelope:
          evidenceEnvelope,

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
