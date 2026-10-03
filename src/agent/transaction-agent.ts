import {
    loadEnvFile,
} from "node:process";

import {
    z,
} from "zod";

import {
    getToolRequestHash,
    type ToolRequest,
} from "../core/request-bound.js";

import {
    normalizeTransactionInput,
} from "../chain/transaction-intelligence.js";

import {
    buildTransactionAnalysisToolRequest,
    TRANSACTION_ANALYSIS_CHAIN_ID,
    TRANSACTION_ANALYSIS_METHOD,
    TRANSACTION_ANALYSIS_NETWORK,
    TRANSACTION_ANALYSIS_TOOL_ID,
} from "../core/intent-manifest.js";

/*
 * =======================================================
 * BOUND — TRANSACTION INTELLIGENCE AGENT
 * =======================================================
 *
 * Gemini's role:
 *
 * - understand the user's natural-language task
 * - propose the exact transaction-analysis request
 *
 * Gemini's role is NOT:
 *
 * - authorize payment
 * - decide whether payment is safe
 * - sign EIP-712 authorization
 * - access the payer private key
 * - sign an ERC-20 transfer
 * - broadcast a payment
 *
 * BOUND performs deterministic request and payment
 * verification separately.
 */

try {
    loadEnvFile(
        ".env"
    );
} catch {
    /*
     * Environment may already be loaded by the process.
     */
}

/*
 * =======================================================
 * PRODUCT CONFIGURATION
 * =======================================================
 */

export const TRANSACTION_AGENT_CHAIN_ID =
    TRANSACTION_ANALYSIS_CHAIN_ID;

export const TRANSACTION_AGENT_NETWORK =
    TRANSACTION_ANALYSIS_NETWORK;

export const TRANSACTION_AGENT_TOOL_ID =
    TRANSACTION_ANALYSIS_TOOL_ID;

export const TRANSACTION_AGENT_METHOD =
    TRANSACTION_ANALYSIS_METHOD;

const DEFAULT_GEMINI_MODEL =
    "gemini-3.5-flash-lite";

const GEMINI_TIMEOUT_MS =
    30_000;

const MAX_TASK_LENGTH =
    2_000;

/*
 * =======================================================
 * USER TASK
 * =======================================================
 */

const taskSchema =
    z.string()
        .trim()
        .min(
            1,
            "A transaction-analysis task is required."
        )
        .max(
            MAX_TASK_LENGTH,
            "The transaction-analysis task is too long."
        );

/*
 * =======================================================
 * GEMINI STRUCTURED OUTPUT
 * =======================================================
 */

const transactionPlanArgsSchema =
    z.object({
        supported:
            z.boolean(),

        needsClarification:
            z.boolean(),

        clarification:
            z.string()
                .trim()
                .max(500)
                .optional(),

        transactionInput:
            z.string()
                .trim()
                .optional(),

        summary:
            z.string()
                .trim()
                .max(500)
                .optional(),
    });

type TransactionPlanArgs =
    z.infer<
        typeof transactionPlanArgsSchema
    >;

/*
 * =======================================================
 * PUBLIC RESULT TYPES
 * =======================================================
 */

export type TransactionAgentActivity = {
    step:
    | "TASK_RECEIVED"
    | "REQUEST_PLANNED"
    | "CLARIFICATION_REQUIRED"
    | "UNSUPPORTED_REQUEST";

    message:
    string;
};

export type TransactionAgentResult =
    | {
        status:
        "PROPOSED";

        model:
        string;

        task:
        string;

        network:
        typeof TRANSACTION_AGENT_NETWORK;

        request:
        ToolRequest;

        requestHash:
        `0x${string}`;

        summary:
        string;

        activity:
        TransactionAgentActivity[];
    }
    | {
        status:
        "NO_PROPOSAL";

        model:
        string;

        task:
        string;

        message:
        string;

        activity:
        TransactionAgentActivity[];
    };

/*
 * =======================================================
 * GEMINI PROTOCOL TYPES
 * =======================================================
 */

type GeminiFunctionCall = {
    name:
    string;

    args?:
    Record<
        string,
        unknown
    >;
};

type GeminiPart = {
    text?:
    string;

    functionCall?:
    GeminiFunctionCall;
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
        content?:
        GeminiContent;
    }>;

    error?: {
        message?:
        string;
    };
};

type GeminiToolDefinition =
    Array<{
        functionDeclarations:
        Array<
            Record<
                string,
                unknown
            >
        >;
    }>;

/*
 * =======================================================
 * CONFIGURATION
 * =======================================================
 */

function getGeminiApiKey():
    string {
    const apiKey =
        process.env
            .GEMINI_API_KEY;

    if (
        !apiKey ||
        apiKey.trim() ===
        ""
    ) {
        throw new Error(
            "GEMINI_API_KEY is missing."
        );
    }

    return apiKey;
}

export function getTransactionAgentModel():
    string {
    return (
        process.env
            .GEMINI_MODEL ??
        DEFAULT_GEMINI_MODEL
    );
}

/*
 * =======================================================
 * GEMINI REQUEST
 * =======================================================
 */

async function callGemini(
    input: {
        contents:
        GeminiContent[];

        systemInstruction:
        string;

        tools:
        GeminiToolDefinition;
    }
): Promise<
    GeminiContent
> {
    const model =
        getTransactionAgentModel();

    const response =
        await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
                model
            )}:generateContent`,
            {
                method:
                    "POST",

                headers: {
                    "content-type":
                        "application/json",

                    "x-goog-api-key":
                        getGeminiApiKey(),
                },

                signal:
                    AbortSignal.timeout(
                        GEMINI_TIMEOUT_MS
                    ),

                body:
                    JSON.stringify({
                        systemInstruction: {
                            parts: [
                                {
                                    text:
                                        input
                                            .systemInstruction,
                                },
                            ],
                        },

                        contents:
                            input.contents,

                        tools:
                            input.tools,

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
        await response
            .json() as
        GeminiApiResponse;

    if (
        !response.ok
    ) {
        throw new Error(
            data.error?.message ??
            `Gemini HTTP ${response.status}`
        );
    }

    const content =
        data
            .candidates?.[0]
            ?.content;

    if (
        !content
    ) {
        throw new Error(
            "Gemini returned no candidate."
        );
    }

    return content;
}

/*
 * =======================================================
 * TOOL DECLARATION
 * =======================================================
 */

const transactionPlanningTools:
    GeminiToolDefinition = [
        {
            functionDeclarations: [
                {
                    name:
                        "propose_transaction_analysis",

                    description:
                        "Propose the exact BNB Smart Chain Testnet transaction hash that BOUND's paid analysis tool should analyze.",

                    parameters: {
                        type:
                            "OBJECT",

                        properties: {
                            supported: {
                                type:
                                    "BOOLEAN",

                                description:
                                    "True only when the request concerns one BNB Smart Chain Testnet transaction.",
                            },

                            needsClarification: {
                                type:
                                    "BOOLEAN",

                                description:
                                    "True when a transaction hash or BSC Testnet BscScan transaction URL is missing or ambiguous.",
                            },

                            clarification: {
                                type:
                                    "STRING",

                                description:
                                    "A short user-facing explanation of what exact transaction input is missing.",
                            },

                            transactionInput: {
                                type:
                                    "STRING",

                                description:
                                    "The exact raw transaction hash or BSC Testnet BscScan transaction URL supplied by the user. Never invent or alter it.",
                            },

                            summary: {
                                type:
                                    "STRING",

                                description:
                                    "A short factual description of what transaction will be analyzed. Do not make a security verdict.",
                            },
                        },

                        required: [
                            "supported",
                            "needsClarification",
                        ],
                    },
                },
            ],
        },
    ];

/*
 * =======================================================
 * SYSTEM INSTRUCTION
 * =======================================================
 */

const transactionPlanningSystemInstruction = `
You are the planning layer for BOUND.

BOUND protects paid AI tool calls by binding a user's authorization to the exact semantic tool request.

The only paid capability in this prototype is:

- Tool: Transaction Analysis
- Tool ID: bound-transaction-analysis
- Method: analyze_transaction
- Network: BNB Smart Chain Testnet
- Chain ID: 97

Your job is to identify the exact transaction the user wants analyzed and call propose_transaction_analysis.

Rules:

1. You are not the security authority.
2. You cannot authorize payment.
3. You cannot sign a wallet message.
4. You cannot access a private key.
5. You cannot sign or broadcast a blockchain transaction.
6. You cannot claim that payment occurred.
7. You cannot claim that a transaction is universally safe.
8. Never invent or modify a transaction hash.
9. Accept only a raw 32-byte transaction hash or a BSC Testnet BscScan transaction URL.
10. Do not accept BSC mainnet or another chain.
11. If the transaction input is missing or ambiguous, set needsClarification = true.
12. If the request is outside BSC Testnet transaction analysis, set supported = false and needsClarification = true.
13. If the exact transaction input is present:
    - supported = true
    - needsClarification = false
    - return it unchanged in transactionInput
14. summary may describe the requested analysis, but must not make a security verdict.
15. You must call propose_transaction_analysis.
`;

/*
 * =======================================================
 * HOST-SIDE NORMALIZATION
 * =======================================================
 */

function getModelText(
    content:
        GeminiContent
):
    string {
    return content.parts
        .map(
            (
                part
            ) =>
                part.text ??
                ""
        )
        .join(
            ""
        )
        .trim();
}

function getClarificationMessage(
    plan:
        TransactionPlanArgs,
    fallback:
        string
):
    string {
    const message =
        plan.clarification
            ?.trim();

    return (
        message ||
        fallback
    );
}

/*
 * =======================================================
 * TRANSACTION AGENT
 * =======================================================
 */

export async function runTransactionAgent(
    input: {
        task:
            string;
    }
): Promise<
    TransactionAgentResult
> {
    const task =
        taskSchema.parse(
            input.task
        );

    const model =
        getTransactionAgentModel();

    const activity:
        TransactionAgentActivity[] = [
            {
                step:
                    "TASK_RECEIVED",

                message:
                    "The Transaction Intelligence Agent received the user's analysis request.",
            },
        ];

    const content =
        await callGemini({
            contents: [
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
            ],

            systemInstruction:
                transactionPlanningSystemInstruction,

            tools:
                transactionPlanningTools,
        });

    const functionCall =
        content.parts
            .find(
                (
                    part
                ) =>
                    part
                        .functionCall
                        ?.name ===
                    "propose_transaction_analysis"
            )
            ?.functionCall;

    if (
        !functionCall
    ) {
        const text =
            getModelText(
                content
            );

        throw new Error(
            text
                ? `Gemini did not return a structured transaction-analysis request: ${text}`
                : "Gemini did not return a structured transaction-analysis request."
        );
    }

    const plan =
        transactionPlanArgsSchema.parse(
            functionCall.args ??
            {}
        );

    if (
        !plan.supported
    ) {
        const message =
            getClarificationMessage(
                plan,
                "This prototype currently supports analysis of BNB Smart Chain Testnet transactions only."
            );

        activity.push({
            step:
                "UNSUPPORTED_REQUEST",

            message,
        });

        return {
            status:
                "NO_PROPOSAL",

            model,

            task,

            message,

            activity,
        };
    }

    if (
        plan.needsClarification ||
        !plan.transactionInput
    ) {
        const message =
            getClarificationMessage(
                plan,
                "Provide a BSC Testnet transaction hash or BscScan transaction URL."
            );

        activity.push({
            step:
                "CLARIFICATION_REQUIRED",

            message,
        });

        return {
            status:
                "NO_PROPOSAL",

            model,

            task,

            message,

            activity,
        };
    }

    let normalized;

    try {
        normalized =
            normalizeTransactionInput(
                plan.transactionInput
            );
    } catch {
        const message =
            "The supplied transaction input is not a valid BSC Testnet transaction hash or BscScan transaction URL.";

        activity.push({
            step:
                "CLARIFICATION_REQUIRED",

            message,
        });

        return {
            status:
                "NO_PROPOSAL",

            model,

            task,

            message,

            activity,
        };
    }

    /*
     * The host, not Gemini, constructs the exact semantic
     * tool request that will later be authorized.
     */
    const request =
        buildTransactionAnalysisToolRequest(
            normalized.hash
        );

    const requestHash =
        getToolRequestHash(
            request
        );

    const summary =
        plan.summary
            ?.trim() ||
        `Analyze BSC Testnet transaction ${normalized.hash}.`;

    activity.push({
        step:
            "REQUEST_PLANNED",

        message:
            "The agent proposed a transaction analysis. BOUND normalized the transaction hash and canonicalized the exact paid tool request host-side.",
    });

    return {
        status:
            "PROPOSED",

        model,

        task,

        network:
            TRANSACTION_AGENT_NETWORK,

        request,

        requestHash,

        summary,

        activity,
    };
}
