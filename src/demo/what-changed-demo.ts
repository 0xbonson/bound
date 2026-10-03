import {
  buildTransactionAnalysisIntent,
  buildTransactionAnalysisToolRequest,
} from "../core/intent-manifest.js";

import {
  signMppRequestAuthorization,
  verifyMppRequestBoundPayment,
  type MppPaymentChallenge,
} from "../core/mpp-request-bound.js";

import {
  buildWhatChangedReport,
  type ChangeStatus,
} from "../core/what-changed.js";

const DEMO_PRIVATE_KEY =
  (
    `0x${"22".repeat(32)}`
  ) as `0x${string}`;

const TEST_USDT =
  "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd";

const MERCHANT =
  "0x32438dE3179DF205c63e8793A20BA6885762f537";

const AUTHORIZED_TX =
  "0x4185b1cb8dea410022833f66443230ebda0548178a18f10c92b635b44ee37450";

const CHANGED_TX =
  `0x${"22".repeat(32)}`;

function label(
  value:
    ChangeStatus
): string {
  if (
    value ===
    "CHANGED"
  ) {
    return "CHANGED";
  }

  if (
    value ===
    "WITHIN_AUTHORIZATION"
  ) {
    return "WITHIN AUTH";
  }

  return "SAME";
}

function shortHash(
  value:
    string
): string {
  return (
    value.slice(
      0,
      10
    ) +
    "..." +
    value.slice(
      -8
    )
  );
}

async function main():
  Promise<void> {
  const now =
    Date.now();

  const intent =
    buildTransactionAnalysisIntent({
      transactionInput:
        AUTHORIZED_TX,

      authorizationId:
        "bound-what-changed-demo",

      paymentToken:
        TEST_USDT,

      paymentRecipient:
        MERCHANT,

      maxAmountRaw:
        "1000000000000000",

      validUntil:
        now +
        10 * 60 * 1000,
    });

  const signed =
    await signMppRequestAuthorization({
      authorization:
        intent.authorization,

      privateKey:
        DEMO_PRIVATE_KEY,
    });

  /*
   * Same merchant.
   * Same token.
   * Same amount.
   * Same network.
   *
   * Only the transaction-analysis target changes.
   */
  const actualRequest =
    buildTransactionAnalysisToolRequest(
      CHANGED_TX
    );

  const challenge:
    MppPaymentChallenge = {
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

  const verification =
    await verifyMppRequestBoundPayment({
      signedAuthorization:
        signed,

      expectedAuthorizationSigner:
        signed.signer,

      actualRequest,

      challenge,

      now,
    });

  /*
   * This demo intentionally never invokes a payer.
   * The Guard decision is evaluated first.
   */
  const payerInvoked =
    false;

  const broadcast =
    false;

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
        payerInvoked,

        broadcast,
      },
    });

  console.log("");
  console.log("BOUND");
  console.log(
    "Understand the action. Authorize it. Prove it stayed the same."
  );

  console.log("");
  console.log("YOU AUTHORIZED");
  console.log(
    "Analyze transaction"
  );
  console.log(
    shortHash(
      report
        .authorized
        .transactionHash
    )
  );

  console.log("");
  console.log("AGENT REQUESTED");
  console.log(
    "Analyze transaction"
  );
  console.log(
    report
      .actual
      .transactionHash
      ? shortHash(
          report
            .actual
            .transactionHash
        )
      : "unknown"
  );

  console.log("");
  console.log("WHAT CHANGED?");
  console.log(
    `Transaction      ${label(
      report.comparison.transaction
    )}`
  );
  console.log(
    `Analysis tool    ${label(
      report.comparison.analysisTool
    )}`
  );
  console.log(
    `Network          ${label(
      report.comparison.network
    )}`
  );
  console.log(
    `Price            ${label(
      report.comparison.price
    )}`
  );
  console.log(
    `Token            ${label(
      report.comparison.token
    )}`
  );
  console.log(
    `Merchant         ${label(
      report.comparison.merchant
    )}`
  );

  console.log("");
  console.log(
    report.outcome.title
  );

  console.log("");
  console.log(
    `Guard decision   ${report.decision}`
  );
  console.log(
    `Payment stopped  ${
      report.outcome.paymentStopped
        ? "YES"
        : "NO"
    }`
  );
  console.log(
    `Payer invoked    ${
      report.outcome.payerInvoked
        ? "YES"
        : "NO"
    }`
  );
  console.log(
    `Broadcast        ${
      report.outcome.broadcast
        ? "YES"
        : "NO"
    }`
  );

  console.log("");
  console.log("Technical details");
  console.log(
    `Finding          ${
      report
        .technical
        .findingCode ??
      "NONE"
    }`
  );
  console.log(
    `Authorized hash  ${shortHash(
      report
        .technical
        .authorizedRequestHash
    )}`
  );
  console.log(
    `Actual hash      ${shortHash(
      report
        .technical
        .actualRequestHash
    )}`
  );

  console.log("");
}

main().catch(
  (
    error:
      unknown
  ) => {
    console.error(
      "BOUND What Changed demo failed:"
    );

    console.error(
      error instanceof Error
        ? error.message
        : error
    );

    process.exitCode =
      1;
  }
);
