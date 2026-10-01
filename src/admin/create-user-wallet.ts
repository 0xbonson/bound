import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";

import {
  dirname,
} from "node:path";

import {
  generatePrivateKey,
  privateKeyToAccount,
} from "viem/accounts";

const PRIVATE_KEY_PATH =
  ".bound/user/private-key";

const ADDRESS_PATH =
  ".bound/user/address";

async function readExistingPrivateKey():
Promise<`0x${string}` | null> {
  try {
    const value =
      (
        await readFile(
          PRIVATE_KEY_PATH,
          "utf8"
        )
      ).trim();

    if (
      !/^0x[0-9a-fA-F]{64}$/.test(
        value
      )
    ) {
      throw new Error(
        "Existing user private key file is malformed."
      );
    }

    return value as `0x${string}`;
  } catch (
    error
  ) {
    const nodeError =
      error as NodeJS.ErrnoException;

    if (
      nodeError.code ===
      "ENOENT"
    ) {
      return null;
    }

    throw error;
  }
}

async function persistAddress(
  address:
    string
) {
  await writeFile(
    ADDRESS_PATH,
    `${address}\n`,
    {
      encoding:
        "utf8",

      mode:
        0o644,
    }
  );
}

async function main() {
  await mkdir(
    dirname(
      PRIVATE_KEY_PATH
    ),
    {
      recursive:
        true,
    }
  );

  const existingPrivateKey =
    await readExistingPrivateKey();

  if (
    existingPrivateKey
  ) {
    const account =
      privateKeyToAccount(
        existingPrivateKey
      );

    await persistAddress(
      account.address
    );

    console.log(
      "\nBOUND USER AUTHORIZATION WALLET"
    );

    console.log(
      "Existing user authorization wallet found."
    );

    console.log(
      `Address: ${account.address}`
    );

    console.log(
      `Private key file: ${PRIVATE_KEY_PATH}`
    );

    console.log(
      `Trusted address file: ${ADDRESS_PATH}`
    );

    console.log(
      "\nPrivate key was NOT printed."
    );

    console.log(
      "This wallet does not need testnet funds."
    );

    return;
  }

  const privateKey =
    generatePrivateKey();

  const account =
    privateKeyToAccount(
      privateKey
    );

  await writeFile(
    PRIVATE_KEY_PATH,
    privateKey,
    {
      encoding:
        "utf8",

      mode:
        0o600,

      flag:
        "wx",
    }
  );

  await persistAddress(
    account.address
  );

  console.log(
    "\nBOUND USER AUTHORIZATION WALLET CREATED"
  );

  console.log(
    `Address: ${account.address}`
  );

  console.log(
    `Private key file: ${PRIVATE_KEY_PATH}`
  );

  console.log(
    `Trusted address file: ${ADDRESS_PATH}`
  );

  console.log(
    "\nPrivate key was NOT printed."
  );

  console.log(
    "This wallet is used only to sign BOUND authorization policies."
  );

  console.log(
    "It does not need tBNB."
  );
}

await main();
