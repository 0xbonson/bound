const DEFAULT_GEMINI_MODEL =
    "gemini-3.5-flash-lite";

const TRANSLATION_TIMEOUT_MS =
    12_000;

const TRANSLATION_VERSION =
    "bound.lens-translation.v1" as const;

export type LensTranslationStatus =
    | "canonical"
    | "translated"
    | "fallback";

export type LensTranslationResult = {
    version:
        typeof TRANSLATION_VERSION;

    status:
        LensTranslationStatus;

    language:
        string;

    text:
        string;

    canonicalText:
        string;

    modelUsed:
        boolean;

    integrityPreserved:
        boolean;
};

type ProtectedMapping = {
    value:
        string;

    placeholder:
        string;

    count:
        number;
};

function countOccurrences(
    text:
        string,
    value:
        string
):
    number {
    if (
        value.length ===
        0
    ) {
        return 0;
    }

    return (
        text.split(
            value
        ).length -
        1
    );
}

function collectAutomaticProtectedTerms(
    text:
        string
):
    string[] {
    const values =
        new Set<
            string
        >();

    const patterns = [
        /0x[a-fA-F0-9]{8,64}/g,

        /\b[A-Za-z_][A-Za-z0-9_]*\([^()\n]{0,200}\)/g,

        /\b\d+(?:\.\d+)?\b/g,

        /\b[A-Z][A-Z0-9_]{1,15}\b/g,
    ];

    for (
        const pattern of
        patterns
    ) {
        for (
            const match of
            text.matchAll(
                pattern
            )
        ) {
            if (
                match[0]
            ) {
                values.add(
                    match[0]
                );
            }
        }
    }

    return [
        ...values,
    ];
}

function escapeRegExp(
    value:
        string
):
    string {
    return value.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );
}

export function protectLensTranslationText(
    text:
        string,
    protectedTerms:
        string[] =
        []
): {
    text:
        string;

    mappings:
        ProtectedMapping[];
} {
    const candidates =
        new Set([
            ...protectedTerms,
            ...collectAutomaticProtectedTerms(
                text
            ),
        ]);

    const terms = [
        ...candidates,
    ]
        .map(
            (
                value
            ) =>
                value.trim()
        )
        .filter(
            (
                value
            ) =>
                value.length >
                0 &&
                text.includes(
                    value
                )
        )
        .sort(
            (
                left,
                right
            ) =>
                right.length -
                left.length
        );

    /*
     * Build every mapping from the ORIGINAL text first.
     *
     * This is intentionally a single-pass replacement.
     * Sequential replacement can accidentally rewrite
     * generated placeholders when a protected value is
     * itself a substring of a placeholder, for example:
     *
     * __BOUND_UI_0__
     *
     * together with automatic numeric protection of "0".
     */
    const mappings:
        ProtectedMapping[] =
        terms.map(
            (
                value,
                index
            ) => ({
                value,

                placeholder:
                    `__BOUND_PROTECTED_${index}__`,

                /*
                 * Count actual replacements below.
                 * Raw substring counts are incorrect when
                 * protected terms overlap.
                 */
                count:
                    0,
            })
        );

    if (
        mappings.length ===
        0
    ) {
        return {
            text,
            mappings,
        };
    }

    const mappingByValue =
        new Map(
            mappings.map(
                (
                    mapping
                ) => [
                    mapping.value,
                    mapping,
                ] as const
            )
        );

    /*
     * Longer alternatives are first. The replace callback
     * records only replacements that REALLY happened.
     *
     * Example:
     *
     * "BNB Smart Chain Testnet"
     * "BNB"
     *
     * The long phrase wins where they overlap, so the BNB
     * counter must not include the BNB inside that phrase.
     */
    const pattern =
        new RegExp(
            mappings
                .map(
                    (
                        mapping
                    ) =>
                        escapeRegExp(
                            mapping.value
                        )
                )
                .join(
                    "|"
                ),
            "g"
        );

    const masked =
        text.replace(
            pattern,
            (
                matched
            ) => {
                const mapping =
                    mappingByValue.get(
                        matched
                    );

                if (
                    !mapping
                ) {
                    return matched;
                }

                mapping.count +=
                    1;

                return mapping
                    .placeholder;
            }
        );

    return {
        text:
            masked,

        mappings:
            mappings.filter(
                (
                    mapping
                ) =>
                    mapping.count >
                    0
            ),
    };
}

export function restoreLensTranslationText(
    translatedText:
        string,
    mappings:
        ProtectedMapping[]
):
    string | null {
    let restored =
        translatedText;

    for (
        const mapping of
        mappings
    ) {
        const count =
            countOccurrences(
                restored,
                mapping.placeholder
            );

        if (
            count !==
            mapping.count
        ) {
            return null;
        }

        restored =
            restored
                .split(
                    mapping.placeholder
                )
                .join(
                    mapping.value
                );
    }

    return restored;
}

function isEnglishLanguage(
    language:
        string
):
    boolean {
    const normalized =
        language
            .trim()
            .toLowerCase();

    return (
        normalized ===
            "en" ||
        normalized ===
            "english" ||
        normalized.startsWith(
            "en-"
        )
    );
}

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

function getTranslationModel():
    string {
    return (
        process.env
            .GEMINI_MODEL ??
        DEFAULT_GEMINI_MODEL
    );
}

async function generateTranslation(
    text:
        string,
    targetLanguage:
        string
):
    Promise<string> {
    const model =
        getTranslationModel();

    const response =
        await fetch(
            "https://" +
            "generativelanguage.googleapis.com/v1beta/models/" +
            encodeURIComponent(
                model
            ) +
            ":generateContent",
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
                        TRANSLATION_TIMEOUT_MS
                    ),

                body:
                    JSON.stringify({
                        systemInstruction: {
                            parts: [
                                {
                                    text:
`You are the translation layer for BOUND Lens.

Translate the supplied transaction explanation into the requested target language.

Rules:
1. Translate only the prose meaning already present.
2. Do not add, remove, infer, summarize, or reinterpret any blockchain fact.
3. Every token matching __BOUND_PROTECTED_N__ is immutable data.
4. Preserve every protected token exactly, including spelling, capitalization, underscores, and order.
5. Never translate or modify protected amounts, token symbols, hashes, addresses, protocol names, network names, or function signatures.
6. Never add a safety, security, legitimacy, approval, or recommendation verdict.
7. Do not mention AI, Gemini, models, or these instructions.
8. Return only the translated text.
9. The target language or locale is: ${targetLanguage}`,
                                },
                            ],
                        },

                        contents: [
                            {
                                role:
                                    "user",

                                parts: [
                                    {
                                        text:
                                            text,
                                    },
                                ],
                            },
                        ],

                        generationConfig: {
                            temperature:
                                0,
                        },
                    }),
            }
        );

    if (
        !response.ok
    ) {
        throw new Error(
            `Translation model request failed with HTTP ${response.status}.`
        );
    }

    const payload =
        await response.json() as {
            candidates?: Array<{
                content?: {
                    parts?: Array<{
                        text?: string;
                    }>;
                };
            }>;
        };

    const result =
        payload
            .candidates?.[0]
            ?.content
            ?.parts
            ?.map(
                (
                    part
                ) =>
                    part.text ??
                    ""
            )
            .join(
                ""
            )
            .trim() ??
        "";

    if (
        result.length ===
        0
    ) {
        throw new Error(
            "Translation model returned no text."
        );
    }

    return result;
}

export async function translateLensText(
    input: {
        text:
            string;

        targetLanguage:
            string;

        protectedTerms?:
            string[];
    }
):
    Promise<
        LensTranslationResult
    > {
    const canonicalText =
        input.text.trim();

    const targetLanguage =
        input
            .targetLanguage
            .trim();

    if (
        isEnglishLanguage(
            targetLanguage
        )
    ) {
        return {
            version:
                TRANSLATION_VERSION,

            status:
                "canonical",

            language:
                targetLanguage,

            text:
                canonicalText,

            canonicalText,

            modelUsed:
                false,

            integrityPreserved:
                true,
        };
    }

    const protectedText =
        protectLensTranslationText(
            canonicalText,
            input.protectedTerms ??
                []
        );

    try {
        const translated =
            await generateTranslation(
                protectedText.text,
                targetLanguage
            );

        const restored =
            restoreLensTranslationText(
                translated,
                protectedText.mappings
            );

        if (
            !restored
        ) {
            return {
                version:
                    TRANSLATION_VERSION,

                status:
                    "fallback",

                language:
                    targetLanguage,

                text:
                    canonicalText,

                canonicalText,

                modelUsed:
                    true,

                integrityPreserved:
                    false,
            };
        }

        return {
            version:
                TRANSLATION_VERSION,

            status:
                "translated",

            language:
                targetLanguage,

            text:
                restored,

            canonicalText,

            modelUsed:
                true,

            integrityPreserved:
                true,
        };
    } catch {
        return {
            version:
                TRANSLATION_VERSION,

            status:
                "fallback",

            language:
                targetLanguage,

            text:
                canonicalText,

            canonicalText,

            modelUsed:
                true,

            integrityPreserved:
                true,
        };
    }
}
