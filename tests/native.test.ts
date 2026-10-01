import {
  generateKeyPairSync,
} from "node:crypto";

import assert from "node:assert/strict";

import test from "node:test";

import {
  type NativeAuthorization,
  type NativeEvidence,
  signNativeEvidence,
  verifyRawNativeTransfer,
} from "../src/core/native.js";

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

const authorization:
  NativeAuthorization = {
    authorizationId:
      "native-auth-001",

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
      "native-market-report-tool",

    validUntil:
      now +
      10 * 60 * 1000,
  };

function createEvidence(
  overrides: Partial<NativeEvidence> = {}
): NativeEvidence {
  return {
    sourceId:
      "native-market-report-tool",

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
      "native-test-nonce",

    issuedAt:
      now,

    expiresAt:
      now +
      5 * 60 * 1000,

    ...overrides,
  };
}

function verify(
  evidence:
    NativeEvidence,

  transaction = {
    chainId:
      97,

    to:
      RECIPIENT_A,

    valueWei:
      "1000000000000000",

    data:
      "0x",
  }
) {
  const envelope =
    signNativeEvidence(
      evidence,
      PRIVATE_KEY_PEM
    );

  return verifyRawNativeTransfer({
    authorization,

    envelope,

    trustedSources: {
      "native-market-report-tool":
        PUBLIC_KEY_PEM,
    },

    rawTransaction:
      transaction,

    now:
      now + 1_000,
  });
}

test(
  "allows native transfer matching signed evidence",
  () => {
    const result =
      verify(
        createEvidence()
      );

    assert.equal(
      result.decision,
      "ALLOW"
    );

    assert.equal(
      result.findings[0]?.code,
      "PROVENANCE_VERIFIED"
    );
  }
);

test(
  "blocks native recipient mutation",
  () => {
    const result =
      verify(
        createEvidence(),
        {
          chainId:
            97,

          to:
            RECIPIENT_B,

          valueWei:
            "1000000000000000",

          data:
            "0x",
        }
      );

    assert.equal(
      result.decision,
      "BLOCK"
    );

    assert.equal(
      result.findings[0]?.code,
      "RECIPIENT_PROVENANCE_BREAK"
    );
  }
);

test(
  "blocks native amount mutation",
  () => {
    const result =
      verify(
        createEvidence(),
        {
          chainId:
            97,

          to:
            RECIPIENT_A,

          valueWei:
            "2000000000000000",

          data:
            "0x",
        }
      );

    assert.equal(
      result.decision,
      "BLOCK"
    );

    assert.equal(
      result.findings[0]?.code,
      "AMOUNT_PROVENANCE_BREAK"
    );
  }
);

test(
  "blocks native chain mutation",
  () => {
    const result =
      verify(
        createEvidence(),
        {
          chainId:
            56,

          to:
            RECIPIENT_A,

          valueWei:
            "1000000000000000",

          data:
            "0x",
        }
      );

    assert.equal(
      result.decision,
      "BLOCK"
    );

    assert.equal(
      result.findings[0]?.code,
      "CHAIN_PROVENANCE_BREAK"
    );
  }
);

test(
  "blocks calldata attached to plain native transfer",
  () => {
    const result =
      verify(
        createEvidence(),
        {
          chainId:
            97,

          to:
            RECIPIENT_A,

          valueWei:
            "1000000000000000",

          data:
            "0x1234",
        }
      );

    assert.equal(
      result.decision,
      "BLOCK"
    );

    assert.equal(
      result.findings[0]?.code,
      "UNEXPECTED_NATIVE_CALLDATA"
    );
  }
);

test(
  "requires reauthorization when native quote exceeds user maximum",
  () => {
    const result =
      verify(
        createEvidence({
          amountWei:
            "6000000000000000",
        }),
        {
          chainId:
            97,

          to:
            RECIPIENT_A,

          valueWei:
            "6000000000000000",

          data:
            "0x",
        }
      );

    assert.equal(
      result.decision,
      "NEEDS_REAUTHORIZATION"
    );

    assert.equal(
      result.findings[0]?.code,
      "AMOUNT_EXCEEDS_AUTHORIZATION"
    );
  }
);
