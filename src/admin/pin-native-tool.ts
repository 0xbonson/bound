import {
  readFile,
} from "node:fs/promises";

import {
  pinPublicKey,
  publicKeyFingerprint,
} from "../core/trust.js";

const SOURCE_ID =
  "native-market-report-tool";

const TOOL_PUBLIC_KEY =
  ".bound/native-tool/public.pem";

async function main() {
  const publicKeyPem =
    await readFile(
      TOOL_PUBLIC_KEY,
      "utf8"
    );

  console.log(
    "\nBOUND NATIVE TRUST BOOTSTRAP"
  );

  console.log(
    `Source: ${SOURCE_ID}`
  );

  console.log(
    `SHA-256 fingerprint: ${publicKeyFingerprint(
      publicKeyPem
    )}`
  );

  try {
    const result =
      await pinPublicKey({
        sourceId:
          SOURCE_ID,

        publicKeyPem,
      });

    console.log(
      `Pinned: ${result.path}`
    );

    console.log(
      "\nBOUND will now trust native payment evidence signed by this exact key."
    );
  } catch (
    error
  ) {
    const nodeError =
      error as NodeJS.ErrnoException;

    if (
      nodeError.code ===
      "EEXIST"
    ) {
      console.error(
        "\nA key is already pinned for this native source."
      );

      console.error(
        "BOUND refuses to replace it silently."
      );

      console.error(
        "Intentional key rotation must be handled explicitly."
      );

      process.exit(1);
    }

    throw error;
  }
}

await main();
