import assert from "node:assert/strict";
import test from "node:test";

import {
  encodeAbiParameters,
  parseAbiParameters,
  type Address,
  type Hex,
} from "viem";

import {
  decodeUniversalTopLevelAction,
} from "../src/chain/universal-transaction-intelligence.js";

const CONTRACT =
  "0x1111111111111111111111111111111111111111" as Address;

const RECIPIENT =
  "0x2222222222222222222222222222222222222222" as Address;

test(
  "decodes native transfer",
  () => {
    const result =
      decodeUniversalTopLevelAction(
        CONTRACT,
        "0x"
      );

    assert.equal(
      result.type,
      "native_transfer"
    );
  }
);

test(
  "decodes ERC20 transfer",
  () => {
    const encoded =
      encodeAbiParameters(
        parseAbiParameters(
          "address to, uint256 amount"
        ),
        [
          RECIPIENT,
          123n,
        ]
      );

    const data =
      (
        "0xa9059cbb" +
        encoded.slice(2)
      ) as Hex;

    const result =
      decodeUniversalTopLevelAction(
        CONTRACT,
        data
      );

    assert.equal(
      result.type,
      "erc20_transfer"
    );

    if (
      result.type ===
      "erc20_transfer"
    ) {
      assert.equal(
        result.recipient
          .toLowerCase(),
        RECIPIENT
          .toLowerCase()
      );

      assert.equal(
        result.amountRaw,
        "123"
      );
    }
  }
);

test(
  "keeps unknown selector as contract call",
  () => {
    const result =
      decodeUniversalTopLevelAction(
        CONTRACT,
        "0x12345678" as Hex
      );

    assert.equal(
      result.type,
      "contract_call"
    );

    if (
      result.type ===
      "contract_call"
    ) {
      assert.equal(
        result.selector,
        "0x12345678"
      );
    }
  }
);
