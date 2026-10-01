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
  ".bound/agent/private-key";

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
        "Existing agent private key file is malformed."
      );
    }

    return value as `0x${string}`;
  } catch (
    error
  ) {
    const nodeError =
      error as NodeJS.ErrnoException;

    if (
      nodeError.code === "ENOENT"
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
      recursive: true,
    }
  );

  const existingKey =
    await readExistingKey();

  if (existingKey) {
    const account =
      privateKeyToAccount(
        existingKey
      );

    console.log(
      "\nBOUND AGENT WALLET"
    );

    console.log(
      "Existing local testnet wallet found."
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
    "\nBOUND AGENT WALLET CREATED"
  );

  console.log(
    `Address: ${account.address}`
  );

  console.log(
    `Private key file: ${PRIVATE_KEY_PATH}`
  );

  console.log(
    "\nThis wallet is for BNB Smart Chain Testnet only."
  );

  console.log(
    "Private key was NOT printed."
  );

  console.log(
    "Do not use this wallet for real funds."
  );
}

await main();
