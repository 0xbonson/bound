import {
  decodeFunctionData,
  isAddress,
  parseAbi,
} from "viem";

import {
  type Authorization,
  type EvidenceEnvelope,
  type TrustedSources,
  type VerificationResult,
  getEvidenceId,
  verifyTransaction,
} from "./bound.js";

const erc20Abi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
]);

export type RawEvmTransaction = {
  chainId: number;
  to: string;
  data: `0x${string}`;
  value?: string;
};

function blocked(
  code: string,
  message: string
): VerificationResult {
  return {
    decision: "BLOCK",
    findings: [{ code, message }],
  };
}

export function verifyRawErc20Transfer(input: {
  authorization: Authorization;
  envelope: EvidenceEnvelope;
  rawTransaction: RawEvmTransaction;
  trustedSources: TrustedSources;
  now?: number;
}): VerificationResult {
  const { rawTransaction, envelope } = input;

  if (!isAddress(rawTransaction.to)) {
    return blocked(
      "INVALID_TRANSACTION_TARGET",
      "The transaction target is not a valid EVM address."
    );
  }

  if (
    rawTransaction.value !== undefined &&
    BigInt(rawTransaction.value) !== 0n
  ) {
    return blocked(
      "UNEXPECTED_NATIVE_VALUE",
      "An ERC-20 transfer proposal unexpectedly includes native value."
    );
  }

  let decoded;

  try {
    decoded = decodeFunctionData({
      abi: erc20Abi,
      data: rawTransaction.data,
    });
  } catch {
    return blocked(
      "UNSUPPORTED_CALLDATA",
      "BOUND could not decode the calldata as a supported ERC-20 transfer."
    );
  }

  if (decoded.functionName !== "transfer") {
    return blocked(
      "UNSUPPORTED_FUNCTION",
      "The proposed transaction is not an ERC-20 transfer."
    );
  }

  const [recipient, amount] = decoded.args;

  /*
   * Important:
   * recipient and amount come from the actual calldata.
   * token comes from transaction.to.
   * chain comes from the transaction request.
   *
   * The agent does not get to separately tell BOUND what
   * recipient or amount it claims to be signing.
   */
  return verifyTransaction({
    authorization: input.authorization,
    envelope,
    transaction: {
      resourceId: envelope.evidence.resourceId,
      evidenceId: getEvidenceId(envelope.evidence),
      chainId: rawTransaction.chainId,
      token: rawTransaction.to,
      recipient,
      amountRaw: amount.toString(),
    },
    trustedSources: input.trustedSources,
    now: input.now,
  });
}
