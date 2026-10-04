import assert from "node:assert/strict";
import test from "node:test";

import {
    protectLensTranslationText,
    restoreLensTranslationText,
    translateLensText,
} from "../src/chain/lens-translation.js";

test(
    "protects blockchain literals before translation",
    () => {
        const canonical =
            "This transaction swapped 0.01 BNB for 47528.336032003047909324 TEEV through PancakeSwap using swapExactETHForTokens(uint256,address[],address,uint256).";

        const protectedText =
            protectLensTranslationText(
                canonical,
                [
                    "PancakeSwap",
                ]
            );

        assert.equal(
            protectedText.text.includes(
                "0.01"
            ),
            false
        );

        assert.equal(
            protectedText.text.includes(
                "BNB"
            ),
            false
        );

        assert.equal(
            protectedText.text.includes(
                "TEEV"
            ),
            false
        );

        assert.equal(
            protectedText.text.includes(
                "PancakeSwap"
            ),
            false
        );

        assert.equal(
            protectedText.text.includes(
                "swapExactETHForTokens(uint256,address[],address,uint256)"
            ),
            false
        );

        const restored =
            restoreLensTranslationText(
                protectedText.text,
                protectedText.mappings
            );

        assert.equal(
            restored,
            canonical
        );
    }
);

test(
    "rejects translated text that loses protected placeholders",
    () => {
        const canonical =
            "The sender transferred 0.001 USDT to 0x32438dE3179DF205c63e8793A20BA6885762f537.";

        const protectedText =
            protectLensTranslationText(
                canonical
            );

        const corrupted =
            protectedText.text.replace(
                /__BOUND_PROTECTED_\d+__/,
                "CHANGED"
            );

        assert.equal(
            restoreLensTranslationText(
                corrupted,
                protectedText.mappings
            ),
            null
        );
    }
);

test(
    "English bypasses the translation model",
    async () => {
        const canonical =
            "This transaction succeeded.";

        const result =
            await translateLensText({
                text:
                    canonical,

                targetLanguage:
                    "en",
            });

        assert.equal(
            result.status,
            "canonical"
        );

        assert.equal(
            result.text,
            canonical
        );

        assert.equal(
            result.modelUsed,
            false
        );

        assert.equal(
            result.integrityPreserved,
            true
        );
    }
);

test(
    "UI markers with numeric indexes survive protection and restoration",
    () => {
        const canonical =
            [
                "__BOUND_UI_0__ Transaction decoded",
                "__BOUND_UI_1__ Sender",
                "__BOUND_UI_2__ Protocol",
                "__BOUND_UI_3__ Network fee",
            ].join(
                "\n"
            );

        const protectedText =
            protectLensTranslationText(
                canonical,
                [
                    "__BOUND_UI_0__",
                    "__BOUND_UI_1__",
                    "__BOUND_UI_2__",
                    "__BOUND_UI_3__",
                ]
            );

        const restored =
            restoreLensTranslationText(
                protectedText.text,
                protectedText.mappings
            );

        assert.equal(
            restored,
            canonical
        );
    }
);

test(
    "overlapping protected terms count only actual replacements",
    () => {
        const canonical =
            "This transaction sent 0.01 BNB on BNB Smart Chain Testnet and cost 0.001 BNB.";

        const protectedText =
            protectLensTranslationText(
                canonical,
                [
                    "BNB",
                    "BNB Smart Chain Testnet",
                ]
            );

        const restored =
            restoreLensTranslationText(
                protectedText.text,
                protectedText.mappings
            );

        assert.equal(
            restored,
            canonical
        );
    }
);
