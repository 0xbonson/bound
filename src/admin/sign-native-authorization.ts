import {
  randomUUID,
} from "node:crypto";

import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";

import {
  dirname,
} from "node:path";

import {
  getAddress,
} from "viem";

import {
  privateKeyToAccount,
} from "viem/accounts";

import {
  type NativeAuthorization,
} from "../core/native.js";

import {
  signNativeAuthorization,
} from "../core/native-authorization.js";

const USER_PRIVATE_KEY_PATH =
  ".bound/user/private-key";

const USER_ADDRESS_PATH =
  ".bound/user/address";

const AUTHORIZATION_PATH =
  ".bound/authorization/native.json";

const RESOURCE_ID =
  "bnb-market-report";

const SOURCE_ID =
  "native-market-report-tool";

const CHAIN_ID = 97;

const ASSET_SYMBOL =
  "tBNB";

/*
 * 0.005 tBNB
 */
const MAX_AMOUNT_WEI =
  "5000000000000000";

/*
 * Development/demo lifetime.
 *
 * The authorization can be regenerated at
 * any time by rerunning this script.
 */
const AUTHORIZATION_LIFETIME_MS =
  24 * 60 * 60 * 1000;

async function loadPrivateKey():
Promise<`0x${string}`> {
  const value =
    (
      await readFile(
        USER_PRIVATE_KEY_PATH,
        "utf8"
      )
    ).trim();

  if (
    !/^0x[0-9a-fA-F]{64}$/.test(
      value
    )
  ) {
    throw new Error(
      "User authorization private key is missing or malformed. Run npm run user-wallet-create first."
    );
  }

  return value as `0x${string}`;
}

async function loadTrustedUserAddress():
Promise<`0x${string}`> {
  const value =
    (
      await readFile(
        USER_ADDRESS_PATH,
        "utf8"
      )
    ).trim();

  return getAddress(
    value
  );
}

async function main() {
  const privateKey =
    await loadPrivateKey();

  const trustedAddress =
    await loadTrustedUserAddress();

  const account =
    privateKeyToAccount(
      privateKey
    );

  /*
   * Fail closed if local identity configuration
   * does not match the actual signing key.
   */
  if (
    account.address.toLowerCase() !==
    trustedAddress.toLowerCase()
  ) {
    throw new Error(
      "User authorization private key does not match the configured trusted user address."
    );
  }

  const now =
    Date.now();

  const authorization:
    NativeAuthorization = {
      authorizationId:
        randomUUID(),

      resourceId:
        RESOURCE_ID,

      chainId:
        CHAIN_ID,

      assetType:
        "native",

      assetSymbol:
        ASSET_SYMBOL,

      maxAmountWei:
        MAX_AMOUNT_WEI,

      trustedSourceId:
        SOURCE_ID,

      validUntil:
        now +
        AUTHORIZATION_LIFETIME_MS,
  };

  const envelope =
    await signNativeAuthorization({
      authorization,

      privateKey,
    });

  await mkdir(
    dirname(
      AUTHORIZATION_PATH
    ),
    {
      recursive:
        true,
    }
  );

  await writeFile(
    AUTHORIZATION_PATH,
    `${JSON.stringify(
      envelope,
      null,
      2
    )}\n`,
    {
      encoding:
        "utf8",

      mode:
        0o600,
    }
  );

  console.log(
    "\nBOUND EIP-712 AUTHORIZATION SIGNED"
  );

  console.log(
    `Signer: ${account.address}`
  );

  console.log(
    `Authorization ID: ${authorization.authorizationId}`
  );

  console.log(
    `Resource: ${authorization.resourceId}`
  );

  console.log(
    `Chain ID: ${authorization.chainId}`
  );

  console.log(
    `Asset: ${authorization.assetSymbol}`
  );

  console.log(
    `Maximum: 0.005 tBNB`
  );

  console.log(
    `Trusted source: ${authorization.trustedSourceId}`
  );

  console.log(
    `Valid until: ${new Date(
      authorization.validUntil
    ).toISOString()}`
  );

  console.log(
    `Saved: ${AUTHORIZATION_PATH}`
  );

  console.log(
    "\nThe user private key was NOT printed."
  );
}

await main();
