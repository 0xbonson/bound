import assert from "node:assert/strict";
import test from "node:test";

import {
  encodeFunctionData,
  type Address,
} from "viem";

import {
  resolveContractIntelligence,
} from "../src/chain/contract-intelligence.js";

const CONTRACT =
  "0x1111111111111111111111111111111111111111" as Address;

const RECIPIENT =
  "0x2222222222222222222222222222222222222222" as Address;

test(
  "decodes function and arguments from verified ABI",
  async () => {
    const abi = [
      {
        type:
          "function",
        name:
          "transfer",
        stateMutability:
          "nonpayable",
        inputs: [
          {
            name:
              "to",
            type:
              "address",
          },
          {
            name:
              "amount",
            type:
              "uint256",
          },
        ],
        outputs: [
          {
            name:
              "",
            type:
              "bool",
          },
        ],
      },
    ] as const;

    const calldata =
      encodeFunctionData({
        abi,
        functionName:
          "transfer",
        args: [
          RECIPIENT,
          123n,
        ],
      });

    const fetchFn =
      (async () =>
        new Response(
          JSON.stringify({
            match:
              "exact_match",

            abi,

            compilation: {
              name:
                "ExampleToken",
              language:
                "Solidity",
            },

            proxyResolution: {
              isProxy:
                false,
              implementations:
                [],
            },
          }),
          {
            status:
              200,

            headers: {
              "content-type":
                "application/json",
            },
          }
        )) as
          typeof fetch;

    const result =
      await resolveContractIntelligence(
        {
          chainId:
            1,

          address:
            CONTRACT,

          calldata,
        },
        {
          fetchFn,
        }
      );

    assert.equal(
      result.contract.verified,
      true
    );

    assert.equal(
      result.contract.name,
      "ExampleToken"
    );

    assert.equal(
      result.function.signature,
      "transfer(address,uint256)"
    );

    assert.equal(
      result.function.confidence,
      "verified"
    );

    assert.equal(
      result.function.arguments[1]
        ?.value,
      "123"
    );
  }
);

test(
  "falls back to selector database without claiming verification",
  async () => {
    let call =
      0;

    const fetchFn =
      (async () => {
        call +=
          1;

        if (
          call ===
          1
        ) {
          return new Response(
            "{}",
            {
              status:
                404,
            }
          );
        }

        return new Response(
          JSON.stringify({
            results: [
              {
                hex_signature:
                  "0xa9059cbb",

                text_signature:
                  "transfer(address,uint256)",
              },
            ],
          }),
          {
            status:
              200,

            headers: {
              "content-type":
                "application/json",
            },
          }
        );
      }) as
        typeof fetch;

    const result =
      await resolveContractIntelligence(
        {
          chainId:
            56,

          address:
            CONTRACT,

          calldata:
            (
              "0xa9059cbb" +
              "0".repeat(
                128
              )
            ) as
              `0x${string}`,
        },
        {
          fetchFn,
        }
      );

    assert.equal(
      result.contract.verified,
      false
    );

    assert.equal(
      result.function.signature,
      "transfer(address,uint256)"
    );

    assert.equal(
      result.function.resolution,
      "signature_database"
    );

    assert.equal(
      result.function.confidence,
      "candidate"
    );
  }
);

test(
  "does not invent a function when there is no calldata",
  async () => {
    const fetchFn =
      (async () =>
        new Response(
          "{}",
          {
            status:
              404,
          }
        )) as
          typeof fetch;

    const result =
      await resolveContractIntelligence(
        {
          chainId:
            1,

          address:
            CONTRACT,

          calldata:
            "0x",
        },
        {
          fetchFn,
        }
      );

    assert.equal(
      result.function.selector,
      null
    );

    assert.equal(
      result.function.signature,
      null
    );

    assert.equal(
      result.function.confidence,
      "unknown"
    );
  }
);

test(
  "does not choose an arbitrary signature when selector database is ambiguous",
  async () => {
    let call =
      0;

    const fetchFn =
      (async () => {
        call +=
          1;

        if (
          call ===
          1
        ) {
          return new Response(
            "{}",
            {
              status:
                404,
            }
          );
        }

        return new Response(
          JSON.stringify({
            results: [
              {
                hex_signature:
                  "0x7ff36ab5",

                text_signature:
                  "join_tg_invmru_haha_9d69f3f(bool,address)",
              },

              {
                hex_signature:
                  "0x7ff36ab5",

                text_signature:
                  "swapExactETHForTokens(uint256,address[],address,uint256)",
              },
            ],
          }),
          {
            status:
              200,

            headers: {
              "content-type":
                "application/json",
            },
          }
        );
      }) as
        typeof fetch;

    const result =
      await resolveContractIntelligence(
        {
          chainId:
            97,

          address:
            CONTRACT,

          calldata:
            (
              "0x7ff36ab5" +
              "0".repeat(
                256
              )
            ) as
              `0x${string}`,
        },
        {
          fetchFn,
        }
      );

    assert.equal(
      result.function.signature,
      null
    );

    assert.equal(
      result.function.name,
      null
    );

    assert.equal(
      result.function.resolution,
      "signature_database_ambiguous"
    );

    assert.equal(
      result.function.confidence,
      "unknown"
    );

    assert.equal(
      result.function.alternativeSignatures.length,
      2
    );
  }
);
