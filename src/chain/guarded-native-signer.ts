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
 * Structural store interface.
 *
 * Tests can inject an in-memory store
 * without touching .bound/evidence-used.
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
 * SECURITY ORDER:
 *
 * signed user authorization
 *        ↓
 * verify trusted user signer
 *        ↓
 * verify signed tool evidence
 *        ↓
 * verify exact transaction
 *        ↓
 * replay-safe signing gate
 *        ↓
 * execute()
 *
 * execute() must never run before all
 * previous checks succeed.
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
   * VERIFY USER EIP-712 AUTHORIZATION
   * ---------------------------------------------------
   *
   * The signer address embedded in the
   * authorization envelope is NOT trusted
   * by itself.
   *
   * It must match an independently
   * configured expected signer.
   */
  const authorizationVerification =
    await verifySignedNativeAuthorization({
      envelope:
        input.signedAuthorization,

      expectedSigner:
        input.expectedAuthorizationSigner,
    });

  /*
   * Fail before transaction verification
   * or private-key access if user mandate
   * authentication fails.
   */
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

    /*
     * gateSigning returns a non-ALLOW
     * verification unchanged and does not
     * consume replay state.
     */
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
   * VERIFY EXACT TRANSACTION
   * ---------------------------------------------------
   *
   * Authorization comes only from the
   * successfully verified EIP-712 envelope.
   *
   * Caller does not provide a separate
   * trusted authorization object.
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
   *
   * This is the FIRST point where code
   * capable of signing may be reached.
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
 * AGENT PRIVATE KEY LOADER
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
 *
 * The private key is intentionally loaded
 * only inside execute().
 *
 * Therefore:
 *
 * invalid user authorization
 *          ↓
 * blocked
 *          ↓
 * private key is never read
 *
 * OR
 *
 * provenance mismatch
 *          ↓
 * blocked
 *          ↓
 * private key is never read
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
         * -----------------------------------------------
         * DEFENSIVE SIGNER CHECKS
         * -----------------------------------------------
         */

        if (
          transaction.chainId !==
          bscTestnet.id
        ) {
          throw new Error(
            `Signer refuses chain ${transaction.chainId}. Expected BSC Testnet chain ${bscTestnet.id}.`
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
            "Signer refuses a zero or negative native payment."
          );
        }

        const recipient =
          getAddress(
            transaction.to
          );

        /*
         * -----------------------------------------------
         * ONLY NOW LOAD SIGNING KEY
         * -----------------------------------------------
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
         * -----------------------------------------------
         * RPC CHAIN CHECK
         * -----------------------------------------------
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
         * -----------------------------------------------
         * PREFLIGHT
         * -----------------------------------------------
         */

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
              }),

            publicClient
              .getBalance({
                address:
                  recipient,
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
         * -----------------------------------------------
         * REAL SIGN + BROADCAST
         * -----------------------------------------------
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
         * Wait until chain inclusion.
         */
        const receipt =
          await publicClient
            .waitForTransactionReceipt({
              hash,
            });

        const [
          senderBalanceAfter,
          recipientBalanceAfter,
        ] =
          await Promise.all([
            publicClient
              .getBalance({
                address:
                  account.address,
              }),

            publicClient
              .getBalance({
                address:
                  recipient,
              }),
          ]);

        return {
          network:
            "BNB Smart Chain Testnet",

          chainId:
            bscTestnet.id,

          sender:
            account.address,

          recipient,

          valueWei:
            transaction.valueWei,

          valueTbnb:
            formatEther(
              value
            ),

          hash,

          explorerUrl:
            `https://testnet.bscscan.com/tx/${hash}`,

          receiptStatus:
            receipt.status,

          blockNumber:
            receipt.blockNumber
              .toString(),

          gasUsed:
            receipt.gasUsed
              .toString(),

          gasEstimate:
            gasEstimate
              .toString(),

          gasPriceWei:
            gasPrice
              .toString(),

          senderBalanceBeforeWei:
            senderBalanceBefore
              .toString(),

          senderBalanceAfterWei:
            senderBalanceAfter
              .toString(),

          recipientBalanceBeforeWei:
            recipientBalanceBefore
              .toString(),

          recipientBalanceAfterWei:
            recipientBalanceAfter
              .toString(),

          recipientIncreaseWei:
            (
              recipientBalanceAfter -
              recipientBalanceBefore
            ).toString(),
        };
      },
  });
}
