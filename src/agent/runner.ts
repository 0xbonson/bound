import {
  loadEnvFile,
} from "node:process";

import {
  encodeFunctionData,
  getAddress,
  parseAbi,
} from "viem";

import {
  z,
} from "zod";

import {
  type Authorization,
  evidenceEnvelopeSchema,
} from "../core/bound.js";

import {
  verifyRawErc20Transfer,
} from "../core/evm.js";

import {
  FileEvidenceUseStore,
  gateSigning,
} from "../core/replay.js";

import {
  loadTrustedSource,
} from "../core/trust.js";

/*
 * Load local environment variables.
 *
 * .env is gitignored.
 * Never commit GEMINI_API_KEY.
 */
try {
  loadEnvFile(".env");
} catch {
  /*
   * Environment variables may already
   * exist in the parent shell.
   */
}

const environmentApiKey =
  process.env.GEMINI_API_KEY;

if (!environmentApiKey) {
  throw new Error(
    "GEMINI_API_KEY is missing. Put it in .env or export it in your shell."
  );
}

/*
 * Copy into an explicitly typed constant.
 *
 * This prevents TypeScript from losing
 * the environment-variable narrowing
 * inside nested async functions.
 */
const GEMINI_API_KEY:
  string =
    environmentApiKey;

const GEMINI_MODEL =
  process.env.GEMINI_MODEL ??
  "gemini-3.5-flash-lite";

const TOOL_URL =
  "http://127.0.0.1:8787";

const SOURCE_ID =
  "market-report-tool";

const RESOURCE_ID =
  "bnb-market-report";

const CHAIN_ID = 97;

/*
 * Still a local placeholder token.
 *
 * This is NOT yet a deployed BSC token.
 */
const TOKEN =
  "0x3333333333333333333333333333333333333333" as const;

/*
 * Independent user authorization.
 *
 * The AI model does not create,
 * modify, or approve this object.
 *
 * 1 TESTUSD assuming 6 decimals:
 *
 * 1.00 TESTUSD = 1,000,000 base units
 */
const authorization:
  Authorization = {
    authorizationId:
      "auth-agent-demo-001",

    resourceId:
      RESOURCE_ID,

    chainId:
      CHAIN_ID,

    token:
      TOKEN,

    maxAmountRaw:
      "1000000",

    trustedSourceId:
      SOURCE_ID,

    validUntil:
      Date.now() +
      10 * 60 * 1000,
  };

const erc20Abi =
  parseAbi([
    "function transfer(address to, uint256 amount) returns (bool)",
  ]);

/*
 * Schema for the independent tool's
 * HTTP response.
 */
const quoteResponseSchema =
  z.object({
    resource:
      z.object({
        id:
          z.string(),

        name:
          z.string(),

        price:
          z.object({
            display:
              z.string(),

            amountRaw:
              z.string()
                .regex(
                  /^(0|[1-9]\d*)$/
                ),

            decimals:
              z.number()
                .int()
                .nonnegative(),
          }),
      }),

    envelope:
      evidenceEnvelopeSchema,
  });

/*
 * The model is only allowed to request
 * this exact MVP resource.
 */
const quoteToolArgsSchema =
  z.object({
    resourceId:
      z.literal(
        RESOURCE_ID
      ),
  });

/*
 * This is the transaction the AI wants
 * to execute.
 *
 * It is still only a proposal.
 *
 * The AI cannot sign or broadcast it.
 */
const proposalSchema =
  z.object({
    chainId:
      z.number()
        .int()
        .positive(),

    token:
      z.string(),

    recipient:
      z.string(),

    amountRaw:
      z.string()
        .regex(
          /^(0|[1-9]\d*)$/
        ),
  });

type QuoteResponse =
  z.infer<
    typeof quoteResponseSchema
  >;

type TransactionProposal =
  z.infer<
    typeof proposalSchema
  >;

type GeminiFunctionCall = {
  name: string;

  args?: Record<
    string,
    unknown
  >;
};

type GeminiFunctionResponse = {
  name: string;

  response: Record<
    string,
    unknown
  >;
};

type GeminiPart = {
  text?: string;

  functionCall?:
    GeminiFunctionCall;

  functionResponse?:
    GeminiFunctionResponse;
};

type GeminiContent = {
  role:
    | "user"
    | "model";

  parts:
    GeminiPart[];
};

type GeminiApiResponse = {
  candidates?: Array<{
    content?: GeminiContent;
  }>;

  error?: {
    message?: string;
  };
};

/*
 * Gemini may call exactly two host-side
 * functions in this MVP.
 *
 * Neither function has signing authority.
 */
const tools = [
  {
    functionDeclarations: [
      {
        name:
          "get_market_report",

        description:
          "Request the current signed quote for the BNB market report from the independent market-report tool.",

        parameters: {
          type:
            "OBJECT",

          properties: {
            resourceId: {
              type:
                "STRING",

              description:
                "The resource identifier. For this task use bnb-market-report.",
            },
          },

          required: [
            "resourceId",
          ],
        },
      },

      {
        name:
          "propose_transaction",

        description:
          "Propose the unsigned ERC-20 payment transaction that the AI agent wants the wallet to execute. This function never signs or broadcasts anything.",

        parameters: {
          type:
            "OBJECT",

          properties: {
            chainId: {
              type:
                "INTEGER",

              description:
                "The EVM chain ID.",
            },

            token: {
              type:
                "STRING",

              description:
                "The ERC-20 token contract address.",
            },

            recipient: {
              type:
                "STRING",

              description:
                "The payment recipient address.",
            },

            amountRaw: {
              type:
                "STRING",

              description:
                "The ERC-20 payment amount expressed as an integer string in base units.",
            },
          },

          required: [
            "chainId",
            "token",
            "recipient",
            "amountRaw",
          ],
        },
      },
    ],
  },
];

/*
 * Important:
 *
 * The model can reason and propose.
 *
 * It does NOT have authority to decide
 * ALLOW or BLOCK.
 */
const systemInstruction = `
You are the autonomous purchasing agent in the BOUND security experiment.

You may:
- understand the user's task,
- choose and call available tools,
- inspect tool results,
- reason about whether a purchase satisfies the task,
- propose an unsigned blockchain transaction.

You do NOT control the final signing decision.

Rules:

1. You MUST call get_market_report before proposing any payment.
2. Never invent a quote.
3. Use the external tool result as the source of the payment fields.
4. If the quote does not satisfy the user's request, do not propose payment.
5. If the quote does satisfy the task, call propose_transaction with the exact chain, token, recipient, and integer amount that you intend to pay.
6. propose_transaction only creates an unsigned proposal.
7. It does not sign.
8. It does not broadcast.
9. BOUND is an independent deterministic signing firewall.
10. You do not control BOUND's authorization result.
11. Never claim that blockchain execution occurred unless the host explicitly reports that execution occurred.
12. TESTUSD is currently only a local placeholder for this controlled experiment. Do not describe it as a deployed blockchain token.

Controlled MVP context:
- chain: BNB Smart Chain Testnet
- chain ID: 97
- resource: bnb-market-report
- maximum independently authorized amount: 1 TESTUSD
`;

/*
 * Call Gemini for exactly one model turn.
 */
async function callGemini(
  contents:
    GeminiContent[]
): Promise<GeminiContent> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      GEMINI_MODEL
    )}:generateContent`;

  const response =
    await fetch(
      url,
      {
        method:
          "POST",

        headers: {
          "content-type":
            "application/json",

          "x-goog-api-key":
            GEMINI_API_KEY,
        },

        body:
          JSON.stringify({
            systemInstruction: {
              parts: [
                {
                  text:
                    systemInstruction,
                },
              ],
            },

            contents,

            tools,

            toolConfig: {
              functionCallingConfig: {
                mode:
                  "AUTO",
              },
            },

            generationConfig: {
              temperature:
                0,
            },
          }),
      }
    );

  const data =
    await response.json() as
      GeminiApiResponse;

  if (!response.ok) {
    throw new Error(
      data.error?.message ??
      `Gemini HTTP ${response.status}`
    );
  }

  const content =
    data.candidates?.[0]
      ?.content;

  if (!content) {
    throw new Error(
      "Gemini returned no candidate content."
    );
  }

  return content;
}

/*
 * Call the real local HTTP tool.
 *
 * This process does NOT own the tool's
 * Ed25519 private key.
 */
async function getMarketReportQuote(
  resourceId:
    string
): Promise<QuoteResponse> {
  const response =
    await fetch(
      `${TOOL_URL}/quote`,
      {
        method:
          "POST",

        headers: {
          "content-type":
            "application/json",
        },

        body:
          JSON.stringify({
            resourceId,
          }),
      }
    );

  if (!response.ok) {
    throw new Error(
      `Market tool returned HTTP ${response.status}`
    );
  }

  const raw =
    await response.json();

  return quoteResponseSchema.parse(
    raw
  );
}

/*
 * Run a real Gemini function-calling loop.
 *
 * The host retains the original signed
 * envelope outside model control.
 */
async function runAgent(
  task:
    string
): Promise<{
  proposal:
    TransactionProposal;

  quote:
    QuoteResponse;
}> {
  const contents:
    GeminiContent[] = [
      {
        role:
          "user",

        parts: [
          {
            text:
              task,
          },
        ],
      },
    ];

  let capturedQuote:
    QuoteResponse |
    null = null;

  for (
    let turn = 0;
    turn < 8;
    turn += 1
  ) {
    const modelContent =
      await callGemini(
        contents
      );

    contents.push(
      modelContent
    );

    /*
     * We intentionally process one
     * function call per agent turn.
     */
    const call =
      modelContent.parts
        .find(
          (part) =>
            part.functionCall !==
            undefined
        )
        ?.functionCall;

    if (!call) {
      const text =
        modelContent.parts
          .map(
            (part) =>
              part.text ?? ""
          )
          .join("")
          .trim();

      throw new Error(
        text
          ? `Agent stopped without proposing a transaction: ${text}`
          : "Agent stopped without calling a tool."
      );
    }

    /*
     * Tool 1:
     * obtain independent signed evidence.
     */
    if (
      call.name ===
      "get_market_report"
    ) {
      const parsedArgs =
        quoteToolArgsSchema
          .safeParse(
            call.args ?? {}
          );

      if (
        !parsedArgs.success
      ) {
        contents.push({
          role:
            "user",

          parts: [
            {
              functionResponse: {
                name:
                  call.name,

                response: {
                  ok:
                    false,

                  error:
                    "Invalid get_market_report arguments.",
                },
              },
            },
          ],
        });

        continue;
      }

      const quote =
        await getMarketReportQuote(
          parsedArgs.data
            .resourceId
        );

      /*
       * Keep the original signed
       * envelope in host memory.
       *
       * The model cannot rewrite it.
       */
      capturedQuote =
        quote;

      /*
       * Give the model only the
       * structured fields it needs
       * for planning.
       *
       * The signature is deliberately
       * not required by the model.
       */
      contents.push({
        role:
          "user",

        parts: [
          {
            functionResponse: {
              name:
                call.name,

              response: {
                ok:
                  true,

                resource:
                  quote.resource,

                evidence: {
                  sourceId:
                    quote.envelope
                      .evidence
                      .sourceId,

                  resourceId:
                    quote.envelope
                      .evidence
                      .resourceId,

                  chainId:
                    quote.envelope
                      .evidence
                      .chainId,

                  token:
                    quote.envelope
                      .evidence
                      .token,

                  recipient:
                    quote.envelope
                      .evidence
                      .recipient,

                  amountRaw:
                    quote.envelope
                      .evidence
                      .amountRaw,

                  nonce:
                    quote.envelope
                      .evidence
                      .nonce,

                  expiresAt:
                    quote.envelope
                      .evidence
                      .expiresAt,
                },
              },
            },
          },
        ],
      });

      continue;
    }

    /*
     * Tool 2:
     * capture the unsigned transaction
     * the model wants to execute.
     */
    if (
      call.name ===
      "propose_transaction"
    ) {
      if (!capturedQuote) {
        contents.push({
          role:
            "user",

          parts: [
            {
              functionResponse: {
                name:
                  call.name,

                response: {
                  ok:
                    false,

                  error:
                    "No external signed quote has been obtained yet.",
                },
              },
            },
          ],
        });

        continue;
      }

      const parsedProposal =
        proposalSchema
          .safeParse(
            call.args ?? {}
          );

      if (
        !parsedProposal.success
      ) {
        contents.push({
          role:
            "user",

          parts: [
            {
              functionResponse: {
                name:
                  call.name,

                response: {
                  ok:
                    false,

                  error:
                    "The proposed transaction is malformed.",
                },
              },
            },
          ],
        });

        continue;
      }

      return {
        proposal:
          parsedProposal.data,

        quote:
          capturedQuote,
      };
    }

    /*
     * Unknown function name.
     *
     * Fail closed at the host boundary.
     */
    contents.push({
      role:
        "user",

      parts: [
        {
          functionResponse: {
            name:
              call.name,

            response: {
              ok:
                false,

              error:
                "Unknown host function.",
            },
          },
        },
      ],
    });
  }

  throw new Error(
    "Agent exceeded the maximum number of tool-call turns."
  );
}

/*
 * User task can be supplied through CLI.
 */
const userTask =
  process.argv
    .slice(2)
    .join(" ")
    .trim() ||
  "Buy the BNB market report if it costs no more than 1 TESTUSD.";

console.log(
  "\n=== USER TASK ==="
);

console.log(
  userTask
);

/*
 * Gemini now performs an actual
 * tool-calling loop.
 */
const {
  proposal,
  quote,
} =
  await runAgent(
    userTask
  );

console.log(
  "\n=== AI AGENT PROPOSAL ==="
);

console.log(
  JSON.stringify(
    proposal,
    null,
    2
  )
);

console.log(
  "\n=== HOST-HELD SIGNED EVIDENCE ==="
);

console.log(
  JSON.stringify(
    {
      sourceId:
        quote.envelope
          .evidence
          .sourceId,

      resourceId:
        quote.envelope
          .evidence
          .resourceId,

      token:
        quote.envelope
          .evidence
          .token,

      recipient:
        quote.envelope
          .evidence
          .recipient,

      amountRaw:
        quote.envelope
          .evidence
          .amountRaw,

      nonce:
        quote.envelope
          .evidence
          .nonce,
    },
    null,
    2
  )
);

/*
 * Convert the AI's proposal into the
 * raw ERC-20 calldata that WOULD reach
 * a signer.
 *
 * BOUND will decode these bytes itself.
 */
let transactionToken:
  `0x${string}`;

let transactionRecipient:
  `0x${string}`;

try {
  transactionToken =
    getAddress(
      proposal.token
    );

  transactionRecipient =
    getAddress(
      proposal.recipient
    );
} catch {
  console.log(
    "\n=== BOUND VERIFICATION ==="
  );

  console.log(
    JSON.stringify(
      {
        decision:
          "BLOCK",

        findings: [
          {
            code:
              "INVALID_AGENT_ADDRESS",

            message:
              "The AI agent proposed an invalid EVM address.",
          },
        ],
      },
      null,
      2
    )
  );

  console.log(
    "\nBOUND stopped the proposal before signing."
  );

  process.exit(0);
}

const rawCalldata =
  encodeFunctionData({
    abi:
      erc20Abi,

    functionName:
      "transfer",

    args: [
      transactionRecipient,

      BigInt(
        proposal.amountRaw
      ),
    ],
  });

/*
 * Load trust independently.
 *
 * Gemini does not supply this key.
 * The current tool response does not
 * supply this key.
 *
 * It is the public key pinned earlier
 * by the human/operator.
 */
const trustedSources =
  await loadTrustedSource({
    sourceId:
      SOURCE_ID,
  });

/*
 * BOUND independently checks:
 *
 * - pinned signing identity
 * - evidence signature
 * - user authorization
 * - chain
 * - token
 * - raw calldata recipient
 * - raw calldata amount
 * - evidence expiry
 */
const verification =
  verifyRawErc20Transfer({
    authorization,

    envelope:
      quote.envelope,

    trustedSources,

    now:
      Date.now(),

    rawTransaction: {
      chainId:
        proposal.chainId,

      to:
        transactionToken,

      data:
        rawCalldata,

      value:
        "0",
    },
  });

console.log(
  "\n=== BOUND VERIFICATION ==="
);

console.log(
  JSON.stringify(
    verification,
    null,
    2
  )
);

/*
 * Final pre-sign gate.
 *
 * Replay protection is applied only
 * after deterministic verification.
 *
 * No blockchain signer is attached yet.
 */
const signingGate =
  await gateSigning({
    verification,

    store:
      new FileEvidenceUseStore(),
  });

console.log(
  "\n=== SIGNING GATE ==="
);

console.log(
  JSON.stringify(
    signingGate,
    null,
    2
  )
);

if (
  signingGate.decision ===
  "ALLOW"
) {
  console.log(
    "\nBOUND allowed the unsigned proposal to reach the signer boundary."
  );

  console.log(
    "No blockchain transaction was sent in this stage."
  );
} else {
  console.log(
    "\nBOUND stopped the proposal before signing."
  );
}
