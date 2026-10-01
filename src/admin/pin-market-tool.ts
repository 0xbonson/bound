import {
  readFile,
} from "node:fs/promises";

import {
  pinPublicKey,
  publicKeyFingerprint,
} from "../core/trust.js";

const SOURCE_ID =
  "market-report-tool";

const TOOL_PUBLIC_KEY =
  ".bound/tool/public.pem";

const publicKeyPem =
  await readFile(
    TOOL_PUBLIC_KEY,
    "utf8"
  );

console.log(
  "\nBOUND TRUST BOOTSTRAP"
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
    "\nBOUND will now trust signed evidence from this exact key."
  );
} catch (error) {
  const nodeError =
    error as NodeJS.ErrnoException;

  if (
    nodeError.code === "EEXIST"
  ) {
    console.error(
      "\nA key is already pinned for this source."
    );

    console.error(
      "BOUND refuses to replace trust silently."
    );

    console.error(
      "If key rotation is intentional, it must be handled explicitly."
    );

    process.exit(1);
  }

  throw error;
}
