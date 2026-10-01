import {
  mkdir,
  open,
} from "node:fs/promises";

import { join } from "node:path";

import type {
  VerificationResult,
} from "./bound.js";

export interface EvidenceUseStore {
  claim(evidenceId: string): Promise<boolean>;
}

/**
 * Useful for unit tests and single-process development.
 *
 * This is NOT durable across process restarts.
 */
export class MemoryEvidenceUseStore
  implements EvidenceUseStore
{
  private readonly used = new Set<string>();

  async claim(
    evidenceId: string
  ): Promise<boolean> {
    if (this.used.has(evidenceId)) {
      return false;
    }

    this.used.add(evidenceId);

    return true;
  }
}

/**
 * Durable local replay protection.
 *
 * Each evidenceId becomes a file created with the
 * exclusive `wx` flag.
 *
 * The operating system guarantees only one caller
 * can successfully create a previously nonexistent
 * file.
 *
 * This makes concurrent claims of the same evidence
 * fail closed.
 */
export class FileEvidenceUseStore
  implements EvidenceUseStore
{
  constructor(
    private readonly directory:
      string = ".bound/evidence-used"
  ) {}

  async claim(
    evidenceId: string
  ): Promise<boolean> {
    const normalized =
      evidenceId.toLowerCase();

    if (
      !/^0x[0-9a-f]{64}$/.test(normalized)
    ) {
      throw new Error(
        "Invalid evidenceId."
      );
    }

    await mkdir(
      this.directory,
      {
        recursive: true,
      }
    );

    const filename =
      `${normalized.slice(2)}.used`;

    const filepath =
      join(
        this.directory,
        filename
      );

    try {
      const handle =
        await open(
          filepath,
          "wx",
          0o600
        );

      try {
        await handle.writeFile(
          JSON.stringify(
            {
              version:
                "bound.evidence-use.v1",
              evidenceId:
                normalized,
              consumedAt:
                new Date().toISOString(),
            },
            null,
            2
          )
        );
      } finally {
        await handle.close();
      }

      return true;
    } catch (error) {
      const nodeError =
        error as NodeJS.ErrnoException;

      if (
        nodeError.code === "EEXIST"
      ) {
        return false;
      }

      throw error;
    }
  }
}

export async function gateSigning(input: {
  verification: VerificationResult;
  store: EvidenceUseStore;
}): Promise<VerificationResult> {
  const {
    verification,
    store,
  } = input;

  /*
   * A rejected transaction must never consume
   * evidence.
   */
  if (
    verification.decision !==
    "ALLOW"
  ) {
    return verification;
  }

  if (!verification.evidenceId) {
    return {
      decision: "BLOCK",
      findings: [
        {
          code:
            "MISSING_EVIDENCE_ID",
          message:
            "BOUND cannot authorize signing without an evidence identifier.",
        },
      ],
    };
  }

  /*
   * This claim must happen immediately before
   * the signer is called.
   *
   * Verification alone does NOT consume
   * evidence.
   */
  const claimed =
    await store.claim(
      verification.evidenceId
    );

  if (!claimed) {
    return {
      decision: "BLOCK",
      evidenceId:
        verification.evidenceId,
      findings: [
        {
          code:
            "EVIDENCE_ALREADY_USED",
          message:
            "This evidence has already authorized a signing attempt and cannot be replayed.",
        },
      ],
    };
  }

  return verification;
}
