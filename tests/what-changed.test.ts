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
  buildWhatChangedReport,
} from "../src/core/what-changed.js";

const PRIVATE_KEY =
  (
    `0x${"22".repeat(32)}`
  ) as `0x${string}`;

const TEST_USDT =
  "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd";

const MERCHANT =
  "0x32438dE3179DF205c63e8793A20BA6885762f537";

const AUTHORIZED_TX =
  `0x${"11".repeat(32)}`;

const CHANGED_TX =
  `0x${"22".repeat(32)}`;

const NOW =
  1_800_000_000_000;

function makeIntent() {
  return buildTransactionAnalysisIntent({
    transactionInput:
      AUTHORIZED_TX,

    authorizationId:
      "what-changed-test",

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
  "shows all fields unchanged for exact authorized request",
  async () => {
    const intent =
      makeIntent();

    const signed =
      await signMppRequestAuthorization({
        authorization:
          intent.authorization,

        privateKey:
          PRIVATE_KEY,
      });

    const challenge =
      makeChallenge();

    const verification =
      await verifyMppRequestBoundPayment({
        signedAuthorization:
          signed,

        expectedAuthorizationSigner:
          signed.signer,

        actualRequest:
          intent.request,

        challenge,

        now:
          NOW,
      });

    const report =
      buildWhatChangedReport({
        manifest:
          intent.manifest,

        actualRequest:
          intent.request,

        challenge,

        guard: {
          decision:
            verification.decision,

          findingCode:
            verification
              .findings[0]
              ?.code ??
            null,

          requestMatches:
            verification
              .requestComparison
              ?.matches ??
            null,
        },

        execution: {
          payerInvoked:
            false,

          broadcast:
            false,
        },
      });

    assert.equal(
      report.decision,
      "ALLOW"
    );

    assert.equal(
      report.comparison.transaction,
      "SAME"
    );

    assert.equal(
      report.comparison.analysisTool,
      "SAME"
    );

    assert.equal(
      report.comparison.network,
      "SAME"
    );

    assert.equal(
      report.comparison.price,
      "SAME"
    );

    assert.equal(
      report.comparison.token,
      "SAME"
    );

    assert.equal(
      report.comparison.merchant,
      "SAME"
    );

    assert.equal(
      report.comparison.request,
      "SAME"
    );

    assert.equal(
      report.outcome.title,
      "Request stayed intact"
    );
  }
);

test(
  "shows transaction changed while payment terms remain the same",
  async () => {
    const intent =
      makeIntent();

    const signed =
      await signMppRequestAuthorization({
        authorization:
          intent.authorization,

        privateKey:
          PRIVATE_KEY,
      });

    const challenge =
      makeChallenge();

    const actualRequest =
      buildTransactionAnalysisToolRequest(
        CHANGED_TX
      );

    const verification =
      await verifyMppRequestBoundPayment({
        signedAuthorization:
          signed,

        expectedAuthorizationSigner:
          signed.signer,

        actualRequest,

        challenge,

        now:
          NOW,
      });

    const report =
      buildWhatChangedReport({
        manifest:
          intent.manifest,

        actualRequest,

        challenge,

        guard: {
          decision:
            verification.decision,

          findingCode:
            verification
              .findings[0]
              ?.code ??
            null,

          requestMatches:
            verification
              .requestComparison
              ?.matches ??
            null,
        },

        execution: {
          payerInvoked:
            false,

          broadcast:
            false,
        },
      });

    assert.equal(
      report.decision,
      "BLOCK"
    );

    assert.equal(
      report.comparison.transaction,
      "CHANGED"
    );

    assert.equal(
      report.comparison.analysisTool,
      "SAME"
    );

    assert.equal(
      report.comparison.network,
      "SAME"
    );

    assert.equal(
      report.comparison.price,
      "SAME"
    );

    assert.equal(
      report.comparison.token,
      "SAME"
    );

    assert.equal(
      report.comparison.merchant,
      "SAME"
    );

    assert.equal(
      report.comparison.request,
      "CHANGED"
    );

    assert.equal(
      report.outcome.title,
      "Request changed after approval"
    );

    assert.equal(
      report.outcome.paymentStopped,
      true
    );

    assert.equal(
      report.outcome.payerInvoked,
      false
    );

    assert.equal(
      report.outcome.broadcast,
      false
    );

    assert.equal(
      report.technical.findingCode,
      "REQUEST_PROVENANCE_BREAK"
    );

    assert.notEqual(
      report
        .technical
        .authorizedRequestHash,

      report
        .technical
        .actualRequestHash
    );
  }
);
