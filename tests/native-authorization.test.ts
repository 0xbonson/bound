import assert from "node:assert/strict";

import test from "node:test";

import {
  generatePrivateKey,
  privateKeyToAccount,
} from "viem/accounts";

import {
  type NativeAuthorization,
} from "../src/core/native.js";

import {
  signNativeAuthorization,
  verifySignedNativeAuthorization,
} from "../src/core/native-authorization.js";

const now =
  Date.now();

function createAuthorization():
NativeAuthorization {
  return {
    authorizationId:
      "signed-auth-test-001",

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
      60 * 60 * 1000,
  };
}

/*
 * =======================================================
 * VALID SIGNATURE
 * =======================================================
 */

test(
  "accepts EIP-712 authorization signed by trusted user",
  async () => {
    const privateKey =
      generatePrivateKey();

    const account =
      privateKeyToAccount(
        privateKey
      );

    const envelope =
      await signNativeAuthorization({
        authorization:
          createAuthorization(),

        privateKey,
      });

    const result =
      await verifySignedNativeAuthorization({
        envelope,

        expectedSigner:
          account.address,
      });

    assert.equal(
      result.valid,
      true
    );

    if (
      result.valid
    ) {
      assert.equal(
        result.signer.toLowerCase(),
        account.address.toLowerCase()
      );

      assert.equal(
        result.authorization
          .maxAmountWei,
        "5000000000000000"
      );
    }
  }
);

/*
 * =======================================================
 * MUTATED AUTHORIZATION
 * =======================================================
 */

test(
  "rejects authorization fields changed after EIP-712 signing",
  async () => {
    const privateKey =
      generatePrivateKey();

    const account =
      privateKeyToAccount(
        privateKey
      );

    const envelope =
      await signNativeAuthorization({
        authorization:
          createAuthorization(),

        privateKey,
      });

    /*
     * Attacker changes maximum amount after
     * the user has signed.
     */
    const mutatedEnvelope = {
      ...envelope,

      authorization: {
        ...envelope.authorization,

        maxAmountWei:
          "500000000000000000",
      },
    };

    const result =
      await verifySignedNativeAuthorization({
        envelope:
          mutatedEnvelope,

        expectedSigner:
          account.address,
      });

    assert.equal(
      result.valid,
      false
    );

    if (
      !result.valid
    ) {
      assert.equal(
        result.code,
        "INVALID_AUTHORIZATION_SIGNATURE"
      );
    }
  }
);

/*
 * =======================================================
 * ATTACKER SELF-AUTHORIZATION
 * =======================================================
 */

test(
  "rejects authorization signed by an untrusted wallet",
  async () => {
    const trustedPrivateKey =
      generatePrivateKey();

    const trustedAccount =
      privateKeyToAccount(
        trustedPrivateKey
      );

    const attackerPrivateKey =
      generatePrivateKey();

    const envelope =
      await signNativeAuthorization({
        authorization:
          createAuthorization(),

        privateKey:
          attackerPrivateKey,
      });

    const result =
      await verifySignedNativeAuthorization({
        envelope,

        expectedSigner:
          trustedAccount.address,
      });

    assert.equal(
      result.valid,
      false
    );

    if (
      !result.valid
    ) {
      assert.equal(
        result.code,
        "UNAUTHORIZED_AUTHORIZATION_SIGNER"
      );
    }
  }
);
