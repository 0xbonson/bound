import assert from "node:assert/strict";
import test from "node:test";

import type {
  UniversalTransactionFacts,
} from "../src/chain/universal-transaction-intelligence.js";

import type {
  TransactionInterpretation,
} from "../src/chain/transaction-interpretation.js";

import {
  buildLensAgentCatalog,
  buildLensAgentContext,
  parseLensAgentModelResponse,
  validateLensAgentAnswerLiterals,
} from "../src/agent/lens-agent.js";

const facts = {
  subject: {
    chainId: 97,
    network:
      "BNB Smart Chain Testnet",
    nativeSymbol:
      "BNB",
    transactionHash:
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    explorerUrl:
      "https://testnet.bscscan.com/tx/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  },

  transaction: {
    status:
      "success",
    from:
      "0x1111111111111111111111111111111111111111",
    to:
      "0x2222222222222222222222222222222222222222",
    blockNumber:
      "123",
    blockTimestamp:
      "2026-10-04T00:00:00.000Z",
    nativeValueFormatted:
      "0.01",
    transactionFeeFormatted:
      "0.00002",

    /*
     * Deliberately present in the source facts.
     * Agent context must not expose raw calldata.
     */
    input:
      "0xdeadbeef",
  },

  action: {
    type:
      "contract_call",
    selector:
      "0x7ff36ab5",
  },

  tokenTransfers: [
    {
      token:
        "0x3333333333333333333333333333333333333333",
      symbol:
        "TEEV",
      decimals:
        18,
      from:
        "0x4444444444444444444444444444444444444444",
      to:
        "0x1111111111111111111111111111111111111111",
      amountRaw:
        "47528336032003047909324",
      amountFormatted:
        "47528.336032003047909324",
    },
  ],
} as unknown as
  UniversalTransactionFacts;

const interpretation = {
  headline:
    "Swap via PancakeSwap",

  plainEnglish:
    "This transaction swapped 0.01 BNB for 47528.336032003047909324 TEEV through PancakeSwap.",

  interaction: {
    functionName:
      "swapExactETHForTokens",
    functionSignature:
      "swapExactETHForTokens(uint256,address[],address,uint256)",
    functionConfidence:
      "verified",
  },

  protocol: {
    status:
      "identified",
    name:
      "PancakeSwap",
    component:
      "V2 Router",
    confidence:
      "verified",
  },

  swap: {
    status:
      "identified",
    summary:
      "0.01 BNB was swapped for 47528.336032003047909324 TEEV.",
  },

  observedWalletEffect: {
    wallet:
      "0x1111111111111111111111111111111111111111",
  },

  whatWeKnow: [
    "The transaction called the verified PancakeSwap V2 Router.",
  ],

  whatWeCannotProve: [
    "The transaction data alone does not prove that the received token is legitimate or economically valuable.",
  ],

  evidence: {
    deterministic:
      true,
    verifiedAbiUsed:
      true,
    officialProtocolAbiUsed:
      true,
    aiUsedForFacts:
      false,
    internalNativeTransfersTraced:
      false,
  },
} as unknown as
  TransactionInterpretation;

test(
  "builds host-controlled evidence catalog",
  () => {
    const catalog =
      buildLensAgentCatalog(
        facts,
        interpretation
      );

    assert.match(
      catalog.evidence.PROTOCOL!,
      /PancakeSwap/
    );

    assert.match(
      catalog.evidence.SWAP!,
      /0\.01 BNB/
    );

    assert.match(
      catalog
        .limitations
        .LIMITATION_1!,
      /does not prove/
    );
  }
);

test(
  "raw calldata is not exposed to Lens Agent",
  () => {
    const context =
      buildLensAgentContext(
        facts,
        interpretation
      );

    const serialized =
      JSON.stringify(
        context
      );

    assert.doesNotMatch(
      serialized,
      /deadbeef/
    );
  }
);

test(
  "accepts model citations only when IDs exist",
  () => {
    const catalog =
      buildLensAgentCatalog(
        facts,
        interpretation
      );

    const parsed =
      parseLensAgentModelResponse(
        JSON.stringify({
          status:
            "ANSWERED",

          answer:
            "The transaction interacted with PancakeSwap.",

          evidenceIds: [
            "PROTOCOL",
            "FUNCTION",
          ],

          limitationIds: [],

          securityVerdictRequested:
            false,
        }),
        catalog
      );

    assert.equal(
      parsed.status,
      "ANSWERED"
    );

    assert.deepEqual(
      parsed.evidenceIds,
      [
        "PROTOCOL",
        "FUNCTION",
      ]
    );
  }
);

test(
  "rejects invented evidence IDs",
  () => {
    const catalog =
      buildLensAgentCatalog(
        facts,
        interpretation
      );

    assert.throws(
      () =>
        parseLensAgentModelResponse(
          JSON.stringify({
            status:
              "ANSWERED",

            answer:
              "This claim is invented.",

            evidenceIds: [
              "MADE_UP_EVIDENCE",
            ],

            limitationIds: [],

            securityVerdictRequested:
              false,
          }),
          catalog
        ),
      /unknown evidence IDs/
    );
  }
);

test(
  "accepts fenced JSON without weakening evidence validation",
  () => {
    const catalog =
      buildLensAgentCatalog(
        facts,
        interpretation
      );

    const parsed =
      parseLensAgentModelResponse(
        `\`\`\`json
{
  "status": "NEEDS_MORE_EVIDENCE",
  "answer": "The current transaction evidence cannot establish whether the token is legitimate.",
  "evidenceIds": ["TRANSACTION_STATUS"],
  "limitationIds": ["LIMITATION_1"],
  "securityVerdictRequested": false
}
\`\`\``,
        catalog
      );

    assert.equal(
      parsed.status,
      "NEEDS_MORE_EVIDENCE"
    );

    assert.deepEqual(
      parsed.limitationIds,
      [
        "LIMITATION_1",
      ]
    );
  }
);

test(
  "canonicalizes case-only evidence ID variation",
  () => {
    const catalog =
      buildLensAgentCatalog(
        facts,
        interpretation
      );

    const parsed =
      parseLensAgentModelResponse(
        JSON.stringify({
          status:
            "ANSWERED",

          answer:
            "The transaction was a swap.",

          evidenceIds: [
            "SWap",
          ],

          limitationIds: [],

          securityVerdictRequested:
            false,
        }),
        catalog
      );

    assert.deepEqual(
      parsed.evidenceIds,
      [
        "SWAP",
      ]
    );
  }
);

test(
  "accepts exact blockchain numeric literals in Agent prose",
  () => {
    assert.doesNotThrow(
      () =>
        validateLensAgentAnswerLiterals(
          "The sender swapped 0.01 BNB and received 47528.336032003047909324 TEEV.",
          facts,
          interpretation
        )
    );
  }
);

test(
  "rejects rounded or regrouped blockchain numeric literals",
  () => {
    assert.throws(
      () =>
        validateLensAgentAnswerLiterals(
          "The sender received 47,528.33 TEEV.",
          facts,
          interpretation
        ),
      /non-canonical numeric literal/
    );
  }
);
