import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTransactionAnalysisIntent,
  buildTransactionAnalysisToolRequest,
} from "../src/core/intent-manifest.js";

import {
  signMppRequestAuthorization,
  verifyMppRequestBoundPayment,
  type MppPaymentChallenge,
} from "../src/core/mpp-request-bound.js";

import {
  getToolRequestHash,
} from "../src/core/request-bound.js";

const PRIVATE_KEY =
  (
    `0x${"22".repeat(32)}`
  ) as `0x${string}`;

const TEST_USDT =
  "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd";

const MERCHANT =
  "0x32438dE3179DF205c63e8793A20BA6885762f537";

const ORIGINAL_TX =
  `0x${"11".repeat(32)}`;

const MUTATED_TX =
  `0x${"22".repeat(32)}`;

const NOW =
  1_800_000_000_000;

function makeIntent(
  transactionInput:
    string
) {
  return buildTransactionAnalysisIntent({
    transactionInput,

    authorizationId:
      "bound-analysis-test",

    paymentToken:
      TEST_USDT,

    paymentRecipient:
      MERCHANT,

    maxAmountRaw:
      "1000000000000000",

    validUntil:
      NOW +
      10 * 60 * 1000,
  });
}

function makeChallenge():
  MppPaymentChallenge {
  return {
    chainId:
      97,

    currency:
      TEST_USDT,

    recipient:
      MERCHANT,

    amount:
      "1000000000000000",

    credentialTypes: [
      "hash",
    ],
  };
}

test(
  "builds human-readable manifest from exact transaction request",
  () => {
    const bundle =
      makeIntent(
        ORIGINAL_TX
      );

    assert.equal(
      bundle.manifest.action,
      "Analyze transaction"
    );

    assert.equal(
      bundle.manifest.network.chainId,
      97
    );

    assert.equal(
      bundle.manifest.request.transactionHash,
      ORIGINAL_TX
    );

    assert.equal(
      bundle.manifest.request.requestHash,
      getToolRequestHash(
        bundle.request
      )
    );

    assert.equal(
      bundle.authorization.requestHash,
      bundle.manifest.request.requestHash
    );

    assert.equal(
      bundle.authorization.paymentToken,
      TEST_USDT
    );

    assert.equal(
      bundle.authorization.paymentRecipient,
      MERCHANT
    );
  }
);

test(
  "BscScan URL and raw hash produce the same exact request",
  () => {
    const url =
      "https://" +
      "testnet.bscscan.com/tx/" +
      ORIGINAL_TX;

    const fromHash =
      buildTransactionAnalysisToolRequest(
        ORIGINAL_TX
      );

    const fromUrl =
      buildTransactionAnalysisToolRequest(
        url
      );

    assert.equal(
      getToolRequestHash(
        fromHash
      ),
      getToolRequestHash(
        fromUrl
      )
    );
  }
);

test(
  "changing only transaction hash breaks intent continuity before payment",
  async () => {
    const authorized =
      makeIntent(
        ORIGINAL_TX
      );

    const signedAuthorization =
      await signMppRequestAuthorization({
        authorization:
          authorized.authorization,

        privateKey:
          PRIVATE_KEY,
      });

    const challenge =
      makeChallenge();

    const exact =
      await verifyMppRequestBoundPayment({
        signedAuthorization,

        expectedAuthorizationSigner:
          signedAuthorization.signer,

        actualRequest:
          authorized.request,

        challenge,

        now:
          NOW,
      });

    assert.equal(
      exact.decision,
      "ALLOW"
    );

    const mutatedRequest =
      buildTransactionAnalysisToolRequest(
        MUTATED_TX
      );

    const changed =
      await verifyMppRequestBoundPayment({
        signedAuthorization,

        expectedAuthorizationSigner:
          signedAuthorization.signer,

        actualRequest:
          mutatedRequest,

        challenge,

        now:
          NOW,
      });

    assert.equal(
      changed.decision,
      "BLOCK"
    );

    assert.equal(
      changed.findings[0]?.code,
      "REQUEST_PROVENANCE_BREAK"
    );

    assert.equal(
      changed.requestComparison?.matches,
      false
    );

    assert.equal(
      changed.paymentComparison?.chainMatches,
      true
    );

    assert.equal(
      changed.paymentComparison?.tokenMatches,
      true
    );

    assert.equal(
      changed.paymentComparison?.recipientMatches,
      true
    );

    assert.equal(
      changed.paymentComparison
        ?.amountWithinAuthorization,
      true
    );

    assert.notEqual(
      getToolRequestHash(
        authorized.request
      ),
      getToolRequestHash(
        mutatedRequest
      )
    );
  }
);
