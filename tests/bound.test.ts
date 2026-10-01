import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync } from "node:crypto";
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

const abi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
]);

const TOKEN =
  "0x3333333333333333333333333333333333333333" as const;

const OTHER_TOKEN =
  "0x4444444444444444444444444444444444444444" as const;

const RECIPIENT_A =
  "0x1111111111111111111111111111111111111111" as const;

const RECIPIENT_B =
  "0x2222222222222222222222222222222222222222" as const;

function setup() {
  const { publicKey, privateKey } =
    generateKeyPairSync("ed25519");

  const publicKeyPem = publicKey
    .export({
      type: "spki",
      format: "pem",
    })
    .toString();

  const privateKeyPem = privateKey
    .export({
      type: "pkcs8",
      format: "pem",
    })
    .toString();

  const now = Date.now();

  const authorization: Authorization = {
    authorizationId: "auth-001",
    resourceId: "bnb-market-report",
    chainId: 97,
    token: TOKEN,
    maxAmountRaw: "1000000",
    trustedSourceId: "market-tool",
    validUntil: now + 600_000,
  };

  const evidence: Evidence = {
    sourceId: "market-tool",
    resourceId: "bnb-market-report",
    chainId: 97,
    token: TOKEN,
    recipient: RECIPIENT_A,
    amountRaw: "250000",
    nonce: "quote-001",
    issuedAt: now,
    expiresAt: now + 300_000,
  };

  const envelope =
    signEvidence(evidence, privateKeyPem);

  const trustedSources = {
    "market-tool": publicKeyPem,
  };

  return {
    now,
    authorization,
    evidence,
    envelope,
    trustedSources,
    privateKeyPem,
  };
}

function calldata(
  recipient: `0x${string}` = RECIPIENT_A,
  amount = 250000n
) {
  return encodeFunctionData({
    abi,
    functionName: "transfer",
    args: [recipient, amount],
  });
}

test(
  "allows transaction matching authorization and signed evidence",
  () => {
    const fixture = setup();

    const result = verifyRawErc20Transfer({
      authorization: fixture.authorization,
      envelope: fixture.envelope,
      trustedSources: fixture.trustedSources,
      now: fixture.now,
      rawTransaction: {
        chainId: 97,
        to: TOKEN,
        data: calldata(),
        value: "0",
      },
    });

    assert.equal(result.decision, "ALLOW");

    assert.equal(
      result.findings[0]?.code,
      "PROVENANCE_VERIFIED"
    );
  }
);

test(
  "blocks recipient mutation inside actual calldata",
  () => {
    const fixture = setup();

    const result = verifyRawErc20Transfer({
      authorization: fixture.authorization,
      envelope: fixture.envelope,
      trustedSources: fixture.trustedSources,
      now: fixture.now,
      rawTransaction: {
        chainId: 97,
        to: TOKEN,
        data: calldata(RECIPIENT_B),
        value: "0",
      },
    });

    assert.equal(result.decision, "BLOCK");

    assert.ok(
      result.findings.some(
        (finding) =>
          finding.code ===
          "RECIPIENT_PROVENANCE_BREAK"
      )
    );
  }
);

test(
  "blocks amount mutation inside actual calldata",
  () => {
    const fixture = setup();

    const result = verifyRawErc20Transfer({
      authorization: fixture.authorization,
      envelope: fixture.envelope,
      trustedSources: fixture.trustedSources,
      now: fixture.now,
      rawTransaction: {
        chainId: 97,
        to: TOKEN,
        data: calldata(RECIPIENT_A, 500000n),
        value: "0",
      },
    });

    assert.equal(result.decision, "BLOCK");

    assert.ok(
      result.findings.some(
        (finding) =>
          finding.code ===
          "AMOUNT_PROVENANCE_BREAK"
      )
    );
  }
);

test(
  "blocks a different token contract",
  () => {
    const fixture = setup();

    const result = verifyRawErc20Transfer({
      authorization: fixture.authorization,
      envelope: fixture.envelope,
      trustedSources: fixture.trustedSources,
      now: fixture.now,
      rawTransaction: {
        chainId: 97,
        to: OTHER_TOKEN,
        data: calldata(),
        value: "0",
      },
    });

    assert.equal(result.decision, "BLOCK");

    assert.ok(
      result.findings.some(
        (finding) =>
          finding.code ===
          "TOKEN_PROVENANCE_BREAK"
      )
    );
  }
);

test(
  "blocks a different chain",
  () => {
    const fixture = setup();

    const result = verifyRawErc20Transfer({
      authorization: fixture.authorization,
      envelope: fixture.envelope,
      trustedSources: fixture.trustedSources,
      now: fixture.now,
      rawTransaction: {
        chainId: 56,
        to: TOKEN,
        data: calldata(),
        value: "0",
      },
    });

    assert.equal(result.decision, "BLOCK");

    assert.ok(
      result.findings.some(
        (finding) =>
          finding.code ===
          "CHAIN_PROVENANCE_BREAK"
      )
    );
  }
);

test(
  "rejects evidence changed after signing",
  () => {
    const fixture = setup();

    const tamperedEnvelope = {
      ...fixture.envelope,
      evidence: {
        ...fixture.envelope.evidence,
        recipient: RECIPIENT_B,
      },
    };

    const result = verifyRawErc20Transfer({
      authorization: fixture.authorization,
      envelope: tamperedEnvelope,
      trustedSources: fixture.trustedSources,
      now: fixture.now,
      rawTransaction: {
        chainId: 97,
        to: TOKEN,
        data: calldata(RECIPIENT_B),
        value: "0",
      },
    });

    assert.equal(result.decision, "BLOCK");

    assert.equal(
      result.findings[0]?.code,
      "INVALID_EVIDENCE_SIGNATURE"
    );
  }
);

test(
  "rejects evidence signed by an attacker key",
  () => {
    const fixture = setup();

    const attacker =
      generateKeyPairSync("ed25519");

    const attackerPrivateKey = attacker.privateKey
      .export({
        type: "pkcs8",
        format: "pem",
      })
      .toString();

    const forgedEnvelope =
      signEvidence(
        fixture.evidence,
        attackerPrivateKey
      );

    const result = verifyRawErc20Transfer({
      authorization: fixture.authorization,
      envelope: forgedEnvelope,
      trustedSources: fixture.trustedSources,
      now: fixture.now,
      rawTransaction: {
        chainId: 97,
        to: TOKEN,
        data: calldata(),
        value: "0",
      },
    });

    assert.equal(result.decision, "BLOCK");

    assert.equal(
      result.findings[0]?.code,
      "INVALID_EVIDENCE_SIGNATURE"
    );
  }
);

test(
  "requires reauthorization when evidence expires",
  () => {
    const fixture = setup();

    const result = verifyRawErc20Transfer({
      authorization: fixture.authorization,
      envelope: fixture.envelope,
      trustedSources: fixture.trustedSources,
      now: fixture.now + 400_000,
      rawTransaction: {
        chainId: 97,
        to: TOKEN,
        data: calldata(),
        value: "0",
      },
    });

    assert.equal(
      result.decision,
      "NEEDS_REAUTHORIZATION"
    );

    assert.equal(
      result.findings[0]?.code,
      "EVIDENCE_EXPIRED"
    );
  }
);

test(
  "requires reauthorization when authorization expires",
  () => {
    const fixture = setup();

    const authorization = {
      ...fixture.authorization,
      validUntil: fixture.now - 1,
    };

    const result = verifyRawErc20Transfer({
      authorization,
      envelope: fixture.envelope,
      trustedSources: fixture.trustedSources,
      now: fixture.now,
      rawTransaction: {
        chainId: 97,
        to: TOKEN,
        data: calldata(),
        value: "0",
      },
    });

    assert.equal(
      result.decision,
      "NEEDS_REAUTHORIZATION"
    );

    assert.equal(
      result.findings[0]?.code,
      "AUTHORIZATION_EXPIRED"
    );
  }
);

test(
  "requires reauthorization when signed quote exceeds user maximum",
  () => {
    const fixture = setup();

    const expensiveEvidence: Evidence = {
      ...fixture.evidence,
      amountRaw: "2000000",
    };

    const expensiveEnvelope =
      signEvidence(
        expensiveEvidence,
        fixture.privateKeyPem
      );

    const result = verifyRawErc20Transfer({
      authorization: fixture.authorization,
      envelope: expensiveEnvelope,
      trustedSources: fixture.trustedSources,
      now: fixture.now,
      rawTransaction: {
        chainId: 97,
        to: TOKEN,
        data: calldata(
          RECIPIENT_A,
          2000000n
        ),
        value: "0",
      },
    });

    assert.equal(
      result.decision,
      "NEEDS_REAUTHORIZATION"
    );

    assert.equal(
      result.findings[0]?.code,
      "AMOUNT_EXCEEDS_AUTHORIZATION"
    );
  }
);

test(
  "blocks malformed calldata",
  () => {
    const fixture = setup();

    const result = verifyRawErc20Transfer({
      authorization: fixture.authorization,
      envelope: fixture.envelope,
      trustedSources: fixture.trustedSources,
      now: fixture.now,
      rawTransaction: {
        chainId: 97,
        to: TOKEN,
        data: "0x1234",
        value: "0",
      },
    });

    assert.equal(result.decision, "BLOCK");

    assert.equal(
      result.findings[0]?.code,
      "UNSUPPORTED_CALLDATA"
    );
  }
);

test(
  "blocks unexpected native value attached to ERC20 transfer",
  () => {
    const fixture = setup();

    const result = verifyRawErc20Transfer({
      authorization: fixture.authorization,
      envelope: fixture.envelope,
      trustedSources: fixture.trustedSources,
      now: fixture.now,
      rawTransaction: {
        chainId: 97,
        to: TOKEN,
        data: calldata(),
        value: "1",
      },
    });

    assert.equal(result.decision, "BLOCK");

    assert.equal(
      result.findings[0]?.code,
      "UNEXPECTED_NATIVE_VALUE"
    );
  }
);
