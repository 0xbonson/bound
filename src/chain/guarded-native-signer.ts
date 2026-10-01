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
  type NativeAuthorization,
  type NativeEvidenceEnvelope,
  type RawNativeTransaction,
  verifyRawNativeTransfer,
} from "../core/native.js";

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
 * Structural interface only.
 *
 * This lets tests provide an isolated
 * in-memory implementation without
 * touching .bound/evidence-used.
 */
export type EvidenceUseStoreLike = {
  claim(
    evidenceId:
      string
  ): Promise<boolean>;
};

/*
 * =======================================================
 * GENERIC GUARDED EXECUTION
 * =======================================================
 *
 * Critical invariant:
 *
 * The exact transaction passed to execute()
 * is the same transaction verified inside
 * this function.
 *
 * Caller cannot provide a detached ALLOW
 * result for some other transaction.
 */

export async function guardAndExecuteNative<
  T
>(input: {
  authorization:
    NativeAuthorization;

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
}): Promise<
  | {
      status:
        "BLOCKED";

      verification:
        VerificationResult;

      gate:
        VerificationResult;

      executed:
        false;
    }
  | {
      status:
        "EXECUTED";

      verification:
        VerificationResult;

      gate:
        VerificationResult;

      executed:
        true;

      result:
        T;
    }
> {
  /*
   * Re-verify INSIDE the signer boundary.
   *
   * Never accept a caller-provided
   * "ALLOW" as authority.
   */
  const verification =
    verifyRawNativeTransfer({
      authorization:
        input.authorization,

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
   * Atomic replay claim happens
   * immediately before execution.
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
        "BLOCKED",

      verification,

      gate,

      executed:
        false,
    };
  }

  /*
   * Nothing capable of signing should
   * happen before this point.
   */
  const result =
    await input.execute(
      input.transaction
    );

  return {
    status:
      "EXECUTED",

    verification,

    gate,

    executed:
      true,

    result,
  };
}

/*
 * =======================================================
 * PRIVATE KEY LOADER
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
 * REAL BSC TESTNET BROADCAST
 * =======================================================
 *
 * IMPORTANT:
 *
 * Private key is loaded ONLY from inside
 * execute(), meaning:
 *
 * verification
 *      ↓
 * signing gate
 *      ↓
 * ALLOW
 *      ↓
 * private key load
 *      ↓
 * send transaction
 */

export async function broadcastGuardedNativeTransfer(
  input: {
    authorization:
      NativeAuthorization;

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
    authorization:
      input.authorization,

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
         * EXACT TRANSACTION SAFETY CHECKS
         * -------------------------------------------------
         *
         * These are defensive duplicates.
         *
         * The BOUND verifier already checks them,
         * but the signer must also fail closed.
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
         * -------------------------------------------------
         * ONLY NOW READ PRIVATE KEY
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
         * VERIFY RPC CHAIN
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
         * PREFLIGHT
         * -------------------------------------------------
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

        /*
         * Conservative balance preflight.
         *
         * Actual gas cost may differ slightly.
         */
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
         * REAL SIGN + BROADCAST
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
         * Wait for actual chain inclusion.
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
