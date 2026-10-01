import assert from "node:assert/strict";
import test from "node:test";

import {
  generateKeyPairSync,
} from "node:crypto";

import {
  mkdtemp,
  rm,
} from "node:fs/promises";

import {
  tmpdir,
} from "node:os";

import {
  join,
} from "node:path";

import {
  encodeFunctionData,
  parseAbi,
} from "viem";

import {
  type Authorization,
  type Evidence,
  signEvidence,
} from "../src/core/bound.js";

import {
  verifyRawErc20Transfer,
} from "../src/core/evm.js";

import {
  FileEvidenceUseStore,
  MemoryEvidenceUseStore,
  gateSigning,
} from "../src/core/replay.js";

const abi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
]);

const TOKEN =
  "0x3333333333333333333333333333333333333333" as const;

const RECIPIENT_A =
  "0x1111111111111111111111111111111111111111" as const;

const RECIPIENT_B =
  "0x2222222222222222222222222222222222222222" as const;

function createFixture() {
  const {
    publicKey,
    privateKey,
  } = generateKeyPairSync(
    "ed25519"
  );

  const publicKeyPem =
    publicKey
      .export({
        type: "spki",
        format: "pem",
      })
      .toString();

  const privateKeyPem =
    privateKey
      .export({
        type: "pkcs8",
        format: "pem",
      })
      .toString();

  const now =
    Date.now();

  const authorization:
    Authorization = {
      authorizationId:
        "auth-replay-001",

      resourceId:
        "bnb-market-report",

      chainId: 97,

      token: TOKEN,

      maxAmountRaw:
        "1000000",

      trustedSourceId:
        "market-tool",

      validUntil:
        now + 600_000,
    };

  const evidence:
    Evidence = {
      sourceId:
        "market-tool",

      resourceId:
        "bnb-market-report",

      chainId: 97,

      token: TOKEN,

      recipient:
        RECIPIENT_A,

      amountRaw:
        "250000",

      nonce:
        "quote-replay-001",

      issuedAt:
        now,

      expiresAt:
        now + 300_000,
    };

  const envelope =
    signEvidence(
      evidence,
      privateKeyPem
    );

  const trustedSources = {
    "market-tool":
      publicKeyPem,
  };

  return {
    now,
    authorization,
    envelope,
    trustedSources,
  };
}

function calldata(
  recipient:
    `0x${string}` =
      RECIPIENT_A
) {
  return encodeFunctionData({
    abi,
    functionName:
      "transfer",

    args: [
      recipient,
      250000n,
    ],
  });
}

function verifyValidTransaction() {
  const fixture =
    createFixture();

  const verification =
    verifyRawErc20Transfer({
      authorization:
        fixture.authorization,

      envelope:
        fixture.envelope,

      trustedSources:
        fixture.trustedSources,

      now:
        fixture.now,

      rawTransaction: {
        chainId: 97,
        to: TOKEN,
        data: calldata(),
        value: "0",
      },
    });

  return {
    ...fixture,
    verification,
  };
}

test(
  "first signing attempt consumes evidence",
  async () => {
    const fixture =
      verifyValidTransaction();

    const store =
      new MemoryEvidenceUseStore();

    const result =
      await gateSigning({
        verification:
          fixture.verification,

        store,
      });

    assert.equal(
      result.decision,
      "ALLOW"
    );
  }
);

test(
  "second signing attempt with same evidence is blocked",
  async () => {
    const fixture =
      verifyValidTransaction();

    const store =
      new MemoryEvidenceUseStore();

    const first =
      await gateSigning({
        verification:
          fixture.verification,

        store,
      });

    const second =
      await gateSigning({
        verification:
          fixture.verification,

        store,
      });

    assert.equal(
      first.decision,
      "ALLOW"
    );

    assert.equal(
      second.decision,
      "BLOCK"
    );

    assert.equal(
      second.findings[0]?.code,
      "EVIDENCE_ALREADY_USED"
    );
  }
);

test(
  "blocked transaction does not consume valid evidence",
  async () => {
    const fixture =
      createFixture();

    const store =
      new MemoryEvidenceUseStore();

    const poisoned =
      verifyRawErc20Transfer({
        authorization:
          fixture.authorization,

        envelope:
          fixture.envelope,

        trustedSources:
          fixture.trustedSources,

        now:
          fixture.now,

        rawTransaction: {
          chainId: 97,
          to: TOKEN,

          data:
            calldata(
              RECIPIENT_B
            ),

          value: "0",
        },
      });

    const blocked =
      await gateSigning({
        verification:
          poisoned,

        store,
      });

    assert.equal(
      blocked.decision,
      "BLOCK"
    );

    const valid =
      verifyRawErc20Transfer({
        authorization:
          fixture.authorization,

        envelope:
          fixture.envelope,

        trustedSources:
          fixture.trustedSources,

        now:
          fixture.now,

        rawTransaction: {
          chainId: 97,
          to: TOKEN,

          data:
            calldata(
              RECIPIENT_A
            ),

          value: "0",
        },
      });

    const allowed =
      await gateSigning({
        verification:
          valid,

        store,
      });

    assert.equal(
      allowed.decision,
      "ALLOW"
    );
  }
);

test(
  "file store prevents concurrent replay",
  async () => {
    const fixture =
      verifyValidTransaction();

    assert.ok(
      fixture.verification
        .evidenceId
    );

    const directory =
      await mkdtemp(
        join(
          tmpdir(),
          "bound-replay-"
        )
      );

    try {
      const evidenceId =
        fixture.verification
          .evidenceId!;

      /*
       * Two independent store
       * instances simulate separate
       * signing attempts/processes.
       */
      const storeA =
        new FileEvidenceUseStore(
          directory
        );

      const storeB =
        new FileEvidenceUseStore(
          directory
        );

      const [
        claimA,
        claimB,
      ] =
        await Promise.all([
          storeA.claim(
            evidenceId
          ),

          storeB.claim(
            evidenceId
          ),
        ]);

      const successfulClaims =
        [
          claimA,
          claimB,
        ].filter(Boolean);

      assert.equal(
        successfulClaims.length,
        1
      );
    } finally {
      await rm(
        directory,
        {
          recursive: true,
          force: true,
        }
      );
    }
  }
);
