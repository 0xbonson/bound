import {
  getAddress,
  isAddress,
  recoverTypedDataAddress,
} from "viem";

import {
  privateKeyToAccount,
} from "viem/accounts";

import {
  z,
} from "zod";

import {
  type NativeAuthorization,
  nativeAuthorizationSchema,
} from "./native.js";

/*
 * =======================================================
 * EIP-712 DOMAIN
 * =======================================================
 *
 * No verifyingContract is used because this authorization
 * is consumed by BOUND offchain middleware rather than by
 * one specific smart contract.
 */

const DOMAIN_NAME =
  "BOUND";

const DOMAIN_VERSION =
  "1";

export const NATIVE_AUTHORIZATION_VERSION =
  "bound.native.authorization.v1" as const;

/*
 * =======================================================
 * EIP-712 TYPES
 * =======================================================
 */

export const nativeAuthorizationTypes = {
  NativeAuthorization: [
    {
      name:
        "authorizationId",

      type:
        "string",
    },

    {
      name:
        "resourceId",

      type:
        "string",
    },

    {
      name:
        "chainId",

      type:
        "uint256",
    },

    {
      name:
        "assetType",

      type:
        "string",
    },

    {
      name:
        "assetSymbol",

      type:
        "string",
    },

    {
      name:
        "maxAmountWei",

      type:
        "uint256",
    },

    {
      name:
        "trustedSourceId",

      type:
        "string",
    },

    {
      name:
        "validUntil",

      type:
        "uint256",
    },
  ],
} as const;

/*
 * =======================================================
 * SIGNED AUTHORIZATION ENVELOPE
 * =======================================================
 */

const authorizationSignerSchema =
  z.string()
    .refine(
      (value) =>
        isAddress(
          value
        ),
      "Expected a valid EVM signer address."
    )
    .transform(
      (value) =>
        value.toLowerCase()
    );

const signatureSchema =
  z.string()
    .regex(
      /^0x[0-9a-fA-F]{130}$/,
      "Expected a 65-byte ECDSA signature."
    );

export const signedNativeAuthorizationSchema =
  z.object({
    version:
      z.literal(
        NATIVE_AUTHORIZATION_VERSION
      ),

    signer:
      authorizationSignerSchema,

    authorization:
      nativeAuthorizationSchema,

    signature:
      signatureSchema,
  });

export type SignedNativeAuthorization =
  z.infer<
    typeof signedNativeAuthorizationSchema
  >;

/*
 * =======================================================
 * EIP-712 PAYLOAD BUILDERS
 * =======================================================
 */

function buildDomain(
  authorization:
    NativeAuthorization
) {
  return {
    name:
      DOMAIN_NAME,

    version:
      DOMAIN_VERSION,

    chainId:
      authorization.chainId,
  } as const;
}

function buildMessage(
  authorization:
    NativeAuthorization
) {
  return {
    authorizationId:
      authorization.authorizationId,

    resourceId:
      authorization.resourceId,

    chainId:
      BigInt(
        authorization.chainId
      ),

    assetType:
      authorization.assetType,

    assetSymbol:
      authorization.assetSymbol,

    maxAmountWei:
      BigInt(
        authorization.maxAmountWei
      ),

    trustedSourceId:
      authorization.trustedSourceId,

    validUntil:
      BigInt(
        authorization.validUntil
      ),
  };
}

/*
 * =======================================================
 * SIGN AUTHORIZATION
 * =======================================================
 */

export async function signNativeAuthorization(input: {
  authorization:
    NativeAuthorization;

  privateKey:
    `0x${string}`;
}): Promise<SignedNativeAuthorization> {
  const authorization =
    nativeAuthorizationSchema.parse(
      input.authorization
    );

  const account =
    privateKeyToAccount(
      input.privateKey
    );

  const signature =
    await account.signTypedData({
      domain:
        buildDomain(
          authorization
        ),

      types:
        nativeAuthorizationTypes,

      primaryType:
        "NativeAuthorization",

      message:
        buildMessage(
          authorization
        ),
    });

  return signedNativeAuthorizationSchema.parse({
    version:
      NATIVE_AUTHORIZATION_VERSION,

    signer:
      account.address,

    authorization,

    signature,
  });
}

/*
 * =======================================================
 * VERIFICATION RESULT
 * =======================================================
 */

export type SignedAuthorizationVerification =
  | {
      valid:
        true;

      signer:
        `0x${string}`;

      authorization:
        NativeAuthorization;
    }
  | {
      valid:
        false;

      code:
        | "INVALID_AUTHORIZATION_ENVELOPE"
        | "INVALID_EXPECTED_SIGNER"
        | "UNAUTHORIZED_AUTHORIZATION_SIGNER"
        | "INVALID_AUTHORIZATION_SIGNATURE";

      message:
        string;
    };

/*
 * =======================================================
 * VERIFY EIP-712 AUTHORIZATION
 * =======================================================
 *
 * IMPORTANT:
 *
 * The signer address embedded inside the envelope is
 * NOT itself the trust root.
 *
 * The caller must provide expectedSigner from an
 * independently trusted configuration.
 *
 * Otherwise an attacker could simply create another
 * wallet and sign their own authorization.
 */

export async function verifySignedNativeAuthorization(input: {
  envelope:
    unknown;

  expectedSigner:
    string;
}): Promise<SignedAuthorizationVerification> {
  const envelopeResult =
    signedNativeAuthorizationSchema
      .safeParse(
        input.envelope
      );

  if (
    !envelopeResult.success
  ) {
    return {
      valid:
        false,

      code:
        "INVALID_AUTHORIZATION_ENVELOPE",

      message:
        "The signed native authorization envelope is malformed.",
    };
  }

  let expectedSigner:
    `0x${string}`;

  try {
    expectedSigner =
      getAddress(
        input.expectedSigner
      );
  } catch {
    return {
      valid:
        false,

      code:
        "INVALID_EXPECTED_SIGNER",

      message:
        "The configured trusted user signer address is invalid.",
    };
  }

  const envelope =
    envelopeResult.data;

  const normalizedExpectedSigner =
    expectedSigner
      .toLowerCase();

  /*
   * First reject an envelope that openly claims to
   * belong to another user identity.
   */
  if (
    envelope.signer !==
    normalizedExpectedSigner
  ) {
    return {
      valid:
        false,

      code:
        "UNAUTHORIZED_AUTHORIZATION_SIGNER",

      message:
        "The authorization envelope signer is not the trusted user signer.",
    };
  }

  try {
    /*
     * Recover signer from the EIP-712 signature over
     * the exact authorization fields.
     */
    const recoveredSigner =
      await recoverTypedDataAddress({
        domain:
          buildDomain(
            envelope.authorization
          ),

        types:
          nativeAuthorizationTypes,

        primaryType:
          "NativeAuthorization",

        message:
          buildMessage(
            envelope.authorization
          ),

        signature:
          envelope.signature as `0x${string}`,
      });

    if (
      recoveredSigner
        .toLowerCase() !==
      normalizedExpectedSigner
    ) {
      return {
        valid:
          false,

        code:
          "INVALID_AUTHORIZATION_SIGNATURE",

        message:
          "The EIP-712 signature was not produced by the trusted user signer.",
      };
    }

    return {
      valid:
        true,

      signer:
        expectedSigner,

      authorization:
        envelope.authorization,
    };
  } catch {
    return {
      valid:
        false,

      code:
        "INVALID_AUTHORIZATION_SIGNATURE",

      message:
        "The EIP-712 authorization signature could not be verified.",
    };
  }
}
