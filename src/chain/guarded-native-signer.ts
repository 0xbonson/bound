import {
  readFile,
} from "node:fs/promises";

import {
  createPublicClient,
  createWalletClient,
  formatEther,
  getAddress,
  http,
} from "viem";

import {
  bscTestnet,
} from "viem/chains";

import {
  privateKeyToAccount,
} from "viem/accounts";

import {
  type TrustedSources,
  type VerificationResult,
} from "../core/bound.js";

import {
  type NativeEvidenceEnvelope,
  type RawNativeTransaction,
  verifyRawNativeTransfer,
} from "../core/native.js";

import {
  verifySignedNativeAuthorization,
} from "../core/native-authorization.js";

import {
  FileEvidenceUseStore,
  gateSigning,
} from "../core/replay.js";

/*
 * =======================================================
 * CONFIGURATION
 * =======================================================
 */

const PRIVATE_KEY_PATH =
  ".bound/agent/private-key";

const DEFAULT_RPC_URL =
  process.env.BSC_TESTNET_RPC ??
  "https://data-seed-prebsc-1-s1.bnbchain.org:8545/";

/*
 * =======================================================
 * REPLAY STORE INTERFACE
 * =======================================================
 */

export type EvidenceUseStoreLike = {
  claim(
    evidenceId:
      string
  ): Promise<boolean>;
};

/*
 * =======================================================
 * GUARDED EXECUTION
 * =======================================================
 *
 * Security boundary:
 *
 * EIP-712 user authorization
 *        ↓
 * exact user signer verification
 *        ↓
 * signed tool evidence verification
 *        ↓
 * exact proposed transaction verification
 *        ↓
 * replay-safe signing gate
 *        ↓
 * executor
 *
 * The executor must never run before all
 * checks above succeed.
 */

export async function guardAndExecuteNative<
  T
>(input: {
  signedAuthorization:
    unknown;

  expectedAuthorizationSigner:
    string;

  envelope:
    NativeEvidenceEnvelope;

  trustedSources:
    TrustedSources;

  transaction:
    RawNativeTransaction;

  execute:
    (
      transaction:
        RawNativeTransaction
    ) => Promise<T>;

  store?:
    EvidenceUseStoreLike;

  now?:
    number;
}) {
  /*
   * ---------------------------------------------------
   * VERIFY USER AUTHORIZATION
   * ---------------------------------------------------
   */

  const authorizationVerification =
    await verifySignedNativeAuthorization({
      envelope:
        input.signedAuthorization,

      expectedSigner:
        input.expectedAuthorizationSigner,
    });

  if (
    !authorizationVerification.valid
  ) {
    const verification:
      VerificationResult = {
        decision:
          "BLOCK",

        findings: [
          {
            code:
              authorizationVerification.code,

            message:
              authorizationVerification.message,
          },
        ],
      };

    const gate =
      await gateSigning({
        verification,

        store:
          input.store ??
          new FileEvidenceUseStore(),
      });

    return {
      status:
        "BLOCKED" as const,

      executed:
        false as const,

      authorizationVerification,

      verification,

      gate,
    };
  }

  /*
   * ---------------------------------------------------
   * VERIFY TOOL EVIDENCE + EXACT TRANSACTION
   * ---------------------------------------------------
   */

  const verification =
    verifyRawNativeTransfer({
      authorization:
        authorizationVerification
          .authorization,

      envelope:
        input.envelope,

      trustedSources:
        input.trustedSources,

      rawTransaction:
        input.transaction,

      now:
        input.now ??
        Date.now(),
    });

  const store =
    input.store ??
    new FileEvidenceUseStore();

  /*
   * ---------------------------------------------------
   * REPLAY-SAFE SIGNING GATE
   * ---------------------------------------------------
   */

  const gate =
    await gateSigning({
      verification,

      store,
    });

  if (
    gate.decision !==
    "ALLOW"
  ) {
    return {
      status:
        "BLOCKED" as const,

      executed:
        false as const,

      authorizationVerification,

      verification,

      gate,
    };
  }

  /*
   * ---------------------------------------------------
   * EXECUTION
   * ---------------------------------------------------
   */

  const result =
    await input.execute(
      input.transaction
    );

  return {
    status:
      "EXECUTED" as const,

    executed:
      true as const,

    authorizationVerification,

    verification,

    gate,

    result,
  };
}

/*
 * =======================================================
 * PRIVATE KEY
 * =======================================================
 */

async function loadAgentPrivateKey():
Promise<`0x${string}`> {
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
      "Agent private key file is missing or malformed."
    );
  }

  return value as `0x${string}`;
}

/*
 * =======================================================
 * REAL BSC TESTNET EXECUTION
 * =======================================================
 */

export async function broadcastGuardedNativeTransfer(
  input: {
    signedAuthorization:
      unknown;

    expectedAuthorizationSigner:
      string;

    envelope:
      NativeEvidenceEnvelope;

    trustedSources:
      TrustedSources;

    transaction:
      RawNativeTransaction;

    store?:
      EvidenceUseStoreLike;

    rpcUrl?:
      string;
  }
) {
  return guardAndExecuteNative({
    signedAuthorization:
      input.signedAuthorization,

    expectedAuthorizationSigner:
      input.expectedAuthorizationSigner,

    envelope:
      input.envelope,

    trustedSources:
      input.trustedSources,

    transaction:
      input.transaction,

    store:
      input.store,

    execute:
      async (
        transaction
      ) => {
        /*
         * -------------------------------------------------
         * DEFENSIVE SIGNER CHECKS
         * -------------------------------------------------
         */

        if (
          transaction.chainId !==
          bscTestnet.id
        ) {
          throw new Error(
            `Signer refuses chain ${transaction.chainId}. Expected ${bscTestnet.id}.`
          );
        }

        if (
          transaction.data !==
          "0x"
        ) {
          throw new Error(
            "Signer refuses native transaction containing calldata."
          );
        }

        const value =
          BigInt(
            transaction.valueWei
          );

        if (
          value <= 0n
        ) {
          throw new Error(
            "Signer refuses zero or negative native payment."
          );
        }

        const recipient =
          getAddress(
            transaction.to
          );

        /*
         * -------------------------------------------------
         * ONLY NOW ACCESS AGENT PRIVATE KEY
         * -------------------------------------------------
         */

        const privateKey =
          await loadAgentPrivateKey();

        const account =
          privateKeyToAccount(
            privateKey
          );

        const rpcUrl =
          input.rpcUrl ??
          DEFAULT_RPC_URL;

        const publicClient =
          createPublicClient({
            chain:
              bscTestnet,

            transport:
              http(
                rpcUrl
              ),
          });

        const walletClient =
          createWalletClient({
            account,

            chain:
              bscTestnet,

            transport:
              http(
                rpcUrl
              ),
          });

        /*
         * -------------------------------------------------
         * RPC CHAIN CHECK
         * -------------------------------------------------
         */

        const rpcChainId =
          await publicClient
            .getChainId();

        if (
          rpcChainId !==
          bscTestnet.id
        ) {
          throw new Error(
            `RPC returned chain ${rpcChainId}. Expected ${bscTestnet.id}.`
          );
        }

        /*
         * -------------------------------------------------
         * PREFLIGHT SNAPSHOT
         * -------------------------------------------------
         *
         * Capture an explicit block number so
         * our preflight state is not an ambiguous
         * moving "latest" state.
         */

        const preflightBlockNumber =
          await publicClient
            .getBlockNumber();

        const [
          senderBalanceBefore,
          recipientBalanceBefore,
          gasPrice,
        ] =
          await Promise.all([
            publicClient
              .getBalance({
                address:
                  account.address,

                blockNumber:
                  preflightBlockNumber,
              }),

            publicClient
              .getBalance({
                address:
                  recipient,

                blockNumber:
                  preflightBlockNumber,
              }),

            publicClient
              .getGasPrice(),
          ]);

        const gasEstimate =
          await publicClient
            .estimateGas({
              account:
                account.address,

              to:
                recipient,

              value,

              data:
                "0x",
            });

        const estimatedGasCost =
          gasEstimate *
          gasPrice;

        const estimatedRequired =
          value +
          estimatedGasCost;

        if (
          senderBalanceBefore <
          estimatedRequired
        ) {
          throw new Error(
            [
              "Insufficient tBNB for payment + estimated gas.",
              `Balance: ${formatEther(
                senderBalanceBefore
              )} tBNB`,
              `Payment: ${formatEther(
                value
              )} tBNB`,
              `Estimated gas: ${formatEther(
                estimatedGasCost
              )} tBNB`,
            ].join(
              " "
            )
          );
        }

        /*
         * -------------------------------------------------
         * SIGN + BROADCAST
         * -------------------------------------------------
         */

        const hash =
          await walletClient
            .sendTransaction({
              account,

              to:
                recipient,

              value,

              data:
                "0x",
            });

        /*
         * -------------------------------------------------
         * WAIT FOR RECEIPT
         * -------------------------------------------------
         */

        const receipt =
          await publicClient
            .waitForTransactionReceipt({
              hash,
            });

        if (
          receipt.status !==
          "success"
        ) {
          throw new Error(
            `Transaction ${hash} was included but did not succeed.`
          );
        }

        /*
         * -------------------------------------------------
         * READ TRANSACTION BACK FROM CHAIN
         * -------------------------------------------------
         *
         * This is stronger proof than immediately
         * comparing two "latest" balance reads.
         */

        const confirmedTransaction =
          await publicClient
            .getTransaction({
              hash,
            });

        /*
         * -------------------------------------------------
         * VERIFY CONFIRMED ONCHAIN TRANSACTION
         * -------------------------------------------------
         */

        if (
          confirmedTransaction
            .from
            .toLowerCase() !==
          account.address
            .toLowerCase()
        ) {
          throw new Error(
            "Confirmed transaction sender does not match the BOUND agent wallet."
          );
        }

        if (
          !confirmedTransaction.to
        ) {
          throw new Error(
            "Confirmed transaction unexpectedly has no recipient."
          );
        }

        if (
          confirmedTransaction
            .to
            .toLowerCase() !==
          recipient
            .toLowerCase()
        ) {
          throw new Error(
            "Confirmed onchain recipient differs from the transaction BOUND authorized."
          );
        }

        if (
          confirmedTransaction.value !==
          value
        ) {
          throw new Error(
            "Confirmed onchain value differs from the transaction BOUND authorized."
          );
        }

        if (
          confirmedTransaction.input !==
          "0x"
        ) {
          throw new Error(
            "Confirmed native transfer unexpectedly contains calldata."
          );
        }

        /*
         * -------------------------------------------------
         * BLOCK-CONSISTENT BALANCE SNAPSHOT
         * -------------------------------------------------
         *
         * We deliberately use explicit block numbers.
         *
         * This avoids reading "latest" from two RPC
         * backend nodes that may briefly disagree about
         * the newest state.
         */

        const receiptBlockNumber =
          receipt.blockNumber;

        const previousBlockNumber =
          receiptBlockNumber >
          0n
            ? receiptBlockNumber -
              1n
            : receiptBlockNumber;

        const [
          senderBalanceAtReceiptBlock,
          recipientBalancePreviousBlock,
          recipientBalanceAtReceiptBlock,
        ] =
          await Promise.all([
            publicClient
              .getBalance({
                address:
                  account.address,

                blockNumber:
                  receiptBlockNumber,
              }),

            publicClient
              .getBalance({
                address:
                  recipient,

                blockNumber:
                  previousBlockNumber,
              }),

            publicClient
              .getBalance({
                address:
                  recipient,

                blockNumber:
                  receiptBlockNumber,
              }),
          ]);

        const recipientBlockDelta =
          recipientBalanceAtReceiptBlock -
          recipientBalancePreviousBlock;

        /*
         * =================================================
         * RETURN AUDIT EVIDENCE
         * =================================================
         */

        return {
          network:
            "BNB Smart Chain Testnet",

          chainId:
            bscTestnet.id,

          hash,

          explorerUrl:
            `https://testnet.bscscan.com/tx/${hash}`,

          receiptStatus:
            receipt.status,

          blockNumber:
            receiptBlockNumber
              .toString(),

          /*
           * Confirmed transaction fields read
           * back from the chain.
           */
          confirmedFrom:
            confirmedTransaction
              .from,

          confirmedTo:
            confirmedTransaction
              .to,

          confirmedValueWei:
            confirmedTransaction
              .value
              .toString(),

          confirmedValueTbnb:
            formatEther(
              confirmedTransaction
                .value
            ),

          confirmedInput:
            confirmedTransaction
              .input,

          /*
           * Transaction receipt data.
           */
          gasUsed:
            receipt.gasUsed
              .toString(),

          gasEstimate:
            gasEstimate
              .toString(),

          gasPriceWei:
            gasPrice
              .toString(),

          /*
           * Preflight snapshot.
           */
          preflightBlockNumber:
            preflightBlockNumber
              .toString(),

          senderBalanceBeforeWei:
            senderBalanceBefore
              .toString(),

          recipientBalanceBeforeWei:
            recipientBalanceBefore
              .toString(),

          /*
           * Deterministic block snapshots.
           */
          senderBalanceAfterWei:
            senderBalanceAtReceiptBlock
              .toString(),

          recipientBalancePreviousBlockWei:
            recipientBalancePreviousBlock
              .toString(),

          recipientBalanceAfterWei:
            recipientBalanceAtReceiptBlock
              .toString(),

          /*
           * Keep this name for the runner output,
           * but now it comes from explicit block
           * snapshots rather than two "latest" reads.
           */
          recipientIncreaseWei:
            recipientBlockDelta
              .toString(),

          /*
           * The authoritative transfer proof is
           * confirmedValueWei above.
           *
           * This boolean is useful demo telemetry.
           */
          recipientBlockDeltaMatchesTransfer:
            recipientBlockDelta ===
            value,
        };
      },
  });
}
