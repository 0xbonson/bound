import {
    loadEnvFile,
} from "node:process";

import {
    getAddress,
    isAddress,
} from "viem";

import {
    z,
} from "zod";

import {
    getToolRequestHash,
    parseToolRequest,
    type ToolRequest,
} from "../core/request-bound.js";

/*
 * =======================================================
 * BOUND — TRANSACTION CHECK AGENT
 * =======================================================
 *
 * Gemini's role:
 *
 * - understand the user's natural-language task
 * - propose the exact transaction-check request
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
    97 as const;

export const TRANSACTION_AGENT_NETWORK =
    "BNB Smart Chain Testnet" as const;

export const TRANSACTION_AGENT_TOOL_ID =
    "bound-transaction-check" as const;

export const TRANSACTION_AGENT_METHOD =
    "simulate_transaction" as const;

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
            "A transaction-check task is required."
        )
        .max(
            MAX_TASK_LENGTH,
            "The transaction-check task is too long."
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
                .max(
                    500
                )
                .optional(),

        from:
            z.string()
                .optional(),

        to:
            z.string()
                .optional(),

        valueWei:
            z.string()
                .regex(
                    /^(0|[1-9]\d*)$/,
                    "valueWei must be a non-negative integer string."
                )
                .optional(),

        data:
            z.string()
                .optional(),

        summary:
            z.string()
                .trim()
                .max(
                    500
                )
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
                        "propose_transaction_check",

                    description:
                        "Propose the exact BNB Smart Chain Testnet transaction that should be checked by BOUND's paid transaction-check tool.",

                    parameters: {
                        type:
                            "OBJECT",

                        properties: {
                            supported: {
                                type:
                                    "BOOLEAN",

                                description:
                                    "True only when the user is asking BOUND to check or simulate one BNB Smart Chain Testnet transaction.",
                            },

                            needsClarification: {
                                type:
                                    "BOOLEAN",

                                description:
                                    "True when transaction-critical fields are missing, ambiguous, or the request is unsupported.",
                            },

                            clarification: {
                                type:
                                    "STRING",

                                description:
                                    "A short user-facing question explaining exactly what information is missing or unsupported.",
                            },

                            from: {
                                type:
                                    "STRING",

                                description:
                                    "The exact EVM sender address supplied by the user.",
                            },

                            to: {
                                type:
                                    "STRING",

                                description:
                                    "The exact EVM destination address supplied by the user.",
                            },

                            valueWei: {
                                type:
                                    "STRING",

                                description:
                                    "The exact native value in wei as a non-negative decimal integer string.",
                            },

                            data: {
                                type:
                                    "STRING",

                                description:
                                    "Exact hexadecimal calldata. Use 0x only when the user's transaction intentionally has no calldata.",
                            },

                            summary: {
                                type:
                                    "STRING",

                                description:
                                    "A short factual description of the proposed transaction check. Do not make a security verdict.",
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

Your only supported capability in this prototype is:

- Tool: Transaction Check
- Tool ID: bound-transaction-check
- Method: simulate_transaction
- Network: BNB Smart Chain Testnet
- Chain ID: 97

Your job is to understand the user's transaction-check task and call propose_transaction_check.

Important rules:

1. You are not the security authority.
2. You cannot authorize payment.
3. You cannot sign a wallet message.
4. You cannot access a private key.
5. You cannot sign or broadcast a blockchain transaction.
6. You cannot claim that payment occurred.
7. You cannot claim that a transaction is universally safe.
8. Never invent an address, value, or calldata.
9. Preserve addresses exactly semantically. The host will validate and checksum them.
10. valueWei must be a decimal integer string.
11. data must be hexadecimal bytes beginning with 0x.
12. Use data = 0x only when the requested transaction intentionally has no calldata.
13. The network is fixed by the host to BNB Smart Chain Testnet, chain ID 97.
14. Do not accept requests for another chain.
15. If from, to, valueWei, or data is missing or ambiguous, set needsClarification = true.
16. If the request is not a transaction-check request for BNB Smart Chain Testnet, set supported = false and needsClarification = true.
17. If all exact transaction fields are present and valid in meaning:
    - supported = true
    - needsClarification = false
    - provide from
    - provide to
    - provide valueWei
    - provide data
18. summary must describe what will be checked, not whether it is safe.
19. You must call propose_transaction_check.
`;

/*
 * =======================================================
 * HOST-SIDE NORMALIZATION
 * =======================================================
 */

function normalizeAddress(
    raw:
        string,
    field:
        "from" |
        "to"
):
    `0x${string}` {
    if (
        !isAddress(
            raw
        )
    ) {
        throw new Error(
            `Gemini returned an invalid ${field} address.`
        );
    }

    return getAddress(
        raw
    );
}

function normalizeData(
    raw:
        string
):
    `0x${string}` {
    if (
        !/^0x(?:[0-9a-fA-F]{2})*$/.test(
            raw
        )
    ) {
        throw new Error(
            "Gemini returned invalid transaction calldata."
        );
    }

    return raw.toLowerCase() as
        `0x${string}`;
}

function normalizeValueWei(
    raw:
        string
):
    string {
    if (
        !/^(0|[1-9]\d*)$/.test(
            raw
        )
    ) {
        throw new Error(
            "Gemini returned an invalid valueWei."
        );
    }

    return raw;
}

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
                    "Gemini received the user's transaction-check task.",
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
                    "propose_transaction_check"
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
                ? `Gemini did not return a structured transaction request: ${text}`
                : "Gemini did not return a structured transaction request."
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
                "This prototype currently supports exact transaction checks on BNB Smart Chain Testnet only."
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
        plan.needsClarification
    ) {
        const message =
            getClarificationMessage(
                plan,
                "Provide the exact from address, to address, valueWei, and calldata before BOUND can construct the request."
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

    if (
        !plan.from ||
        !plan.to ||
        plan.valueWei ===
        undefined ||
        !plan.data
    ) {
        const message =
            "Gemini marked the task ready but omitted one or more transaction-critical fields.";

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

    const from =
        normalizeAddress(
            plan.from,
            "from"
        );

    const to =
        normalizeAddress(
            plan.to,
            "to"
        );

    const valueWei =
        normalizeValueWei(
            plan.valueWei
        );

    const data =
        normalizeData(
            plan.data
        );

    /*
     * The host, not Gemini, pins all protocol-critical
     * identifiers.
     */
    const request =
        parseToolRequest({
            toolId:
                TRANSACTION_AGENT_TOOL_ID,

            method:
                TRANSACTION_AGENT_METHOD,

            arguments: {
                chainId:
                    TRANSACTION_AGENT_CHAIN_ID,

                from,

                to,

                valueWei,

                data,
            },
        });

    const requestHash =
        getToolRequestHash(
            request
        );

    const summary =
        plan.summary
            ?.trim() ||
        `Check the exact BSC Testnet transaction from ${from} to ${to}.`;

    activity.push({
        step:
            "REQUEST_PLANNED",

        message:
            "Gemini proposed an exact transaction-check request. BOUND canonicalized and hashed it host-side.",
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