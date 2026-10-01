import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";

import {
  createHash,
} from "node:crypto";

import {
  join,
} from "node:path";

const DEFAULT_TRUST_DIRECTORY =
  ".bound/trusted";

function validateSourceId(
  sourceId: string
) {
  if (
    !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(
      sourceId
    )
  ) {
    throw new Error(
      "Invalid sourceId."
    );
  }
}

export function publicKeyFingerprint(
  publicKeyPem: string
): string {
  return createHash("sha256")
    .update(publicKeyPem)
    .digest("hex");
}

export async function pinPublicKey(input: {
  sourceId: string;
  publicKeyPem: string;
  directory?: string;
}): Promise<{
  path: string;
  fingerprint: string;
}> {
  validateSourceId(
    input.sourceId
  );

  const directory =
    input.directory ??
    DEFAULT_TRUST_DIRECTORY;

  await mkdir(
    directory,
    {
      recursive: true,
    }
  );

  const path =
    join(
      directory,
      `${input.sourceId}.pem`
    );

  /*
   * "wx" means create only.
   *
   * If a key has already been pinned,
   * we refuse to silently replace it.
   */
  await writeFile(
    path,
    input.publicKeyPem,
    {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    }
  );

  return {
    path,
    fingerprint:
      publicKeyFingerprint(
        input.publicKeyPem
      ),
  };
}

export async function loadPinnedPublicKey(input: {
  sourceId: string;
  directory?: string;
}): Promise<string> {
  validateSourceId(
    input.sourceId
  );

  const directory =
    input.directory ??
    DEFAULT_TRUST_DIRECTORY;

  const path =
    join(
      directory,
      `${input.sourceId}.pem`
    );

  return readFile(
    path,
    "utf8"
  );
}

export async function loadTrustedSource(input: {
  sourceId: string;
  directory?: string;
}): Promise<Record<string, string>> {
  const publicKeyPem =
    await loadPinnedPublicKey(
      input
    );

  return {
    [input.sourceId]:
      publicKeyPem,
  };
}


