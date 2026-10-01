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
  ".bound/vendor/private-key";

async function readExistingKey():
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
        "Existing vendor private key file is malformed."
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

  const existing =
    await readExistingKey();

  if (existing) {
    const account =
      privateKeyToAccount(
        existing
      );

    console.log(
      "\nBOUND VENDOR WALLET"
    );

    console.log(
      "Existing vendor wallet found."
    );

    console.log(
      `Address: ${account.address}`
    );

    console.log(
      `Private key file: ${PRIVATE_KEY_PATH}`
    );

    console.log(
      "\nPrivate key was NOT printed."
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

  console.log(
    "\nBOUND VENDOR WALLET CREATED"
  );

  console.log(
    `Address: ${account.address}`
  );

  console.log(
    `Private key file: ${PRIVATE_KEY_PATH}`
  );

  console.log(
    "\nPrivate key was NOT printed."
  );

  console.log(
    "This wallet is only a recipient for the BSC Testnet demo."
  );
}

await main();
