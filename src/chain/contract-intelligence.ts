import {
  decodeFunctionData,
  toFunctionSelector,
  type Abi,
  type AbiFunction,
  type Address,
  type Hex,
} from "viem";

export const CONTRACT_INTELLIGENCE_VERSION =
  "bound.contract-intelligence.v1" as const;

export type ContractIntelligence = {
  version:
    typeof CONTRACT_INTELLIGENCE_VERSION;

  contract: {
    address:
      Address;

    chainId:
      number;

    verified:
      boolean;

    name:
      string |
      null;

    language:
      string |
      null;

    match:
      string |
      null;

    isProxy:
      boolean;

    implementations:
      Address[];
  };

  function: {
    selector:
      Hex |
      null;

    name:
      string |
      null;

    signature:
      string |
      null;

    resolution:
      | "verified_abi"
      | "official_protocol_abi"
      | "signature_database"
      | "signature_database_ambiguous"
      | "none";

    confidence:
      | "verified"
      | "candidate"
      | "unknown";

    arguments:
      Array<{
        name:
          string;

        type:
          string;

        value:
          unknown;
      }>;

    alternativeSignatures:
      string[];
  };

  evidence: {
    sourcifyChecked:
      boolean;

    sourcifyVerified:
      boolean;

    signatureDatabaseChecked:
      boolean;

    officialProtocolAbiUsed?:
      boolean;

    officialProtocolSourceName?:
      string |
      null;

    officialProtocolSourceUrl?:
      string |
      null;

    aiUsedForFacts:
      false;
  };
};

type FetchLike =
  typeof fetch;

type SourcifyResponse = {
  match?:
    string;

  abi?:
    Abi;

  compilation?: {
    name?:
      string;

    language?:
      string;
  };

  proxyResolution?: {
    isProxy?:
      boolean;

    implementations?:
      Array<{
        address?:
          string;
      }>;
  };
};

type FourByteResponse = {
  results?:
    Array<{
      hex_signature?:
        string;

      text_signature?:
        string;
    }>;
};

function normalizeDecodedValue(
  value:
    unknown
): unknown {
  if (
    typeof value ===
    "bigint"
  ) {
    return value.toString();
  }

  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      normalizeDecodedValue
    );
  }

  if (
    value !==
      null &&
    typeof value ===
      "object"
  ) {
    return Object.fromEntries(
      Object.entries(
        value as
          Record<
            string,
            unknown
          >
      ).map(
        (
          [
            key,
            nested,
          ]
        ) => [
          key,
          normalizeDecodedValue(
            nested
          ),
        ]
      )
    );
  }

  return value;
}

function functionSignature(
  item:
    AbiFunction
): string {
  return (
    item.name +
    "(" +
    item.inputs
      .map(
        (
          input
        ) =>
          input.type
      )
      .join(
        ","
      ) +
    ")"
  );
}

function findFunctionBySelector(
  abi:
    Abi,

  selector:
    Hex
): AbiFunction | null {
  const functions =
    abi.filter(
      (
        item
      ): item is
        AbiFunction =>
        item.type ===
        "function"
    );

  for (
    const item
    of functions
  ) {
    try {
      const candidate =
        toFunctionSelector(
          item
        );

      if (
        candidate
          .toLowerCase() ===
        selector
          .toLowerCase()
      ) {
        return item;
      }
    } catch {
      // Ignore malformed ABI entries.
    }
  }

  return null;
}

async function fetchSourcify(
  chainId:
    number,

  address:
    Address,

  fetchFn:
    FetchLike
): Promise<
  SourcifyResponse |
  null
> {
  const url =
    "https://" +
    "sourcify.dev/server/v2/contract/" +
    chainId +
    "/" +
    address +
    "?fields=abi,compilation,proxyResolution";

  const response =
    await fetchFn(
      url,
      {
        headers: {
          accept:
            "application/json",
        },
      }
    );

  if (
    response.status ===
    404
  ) {
    return null;
  }

  if (
    !response.ok
  ) {
    throw new Error(
      `Sourcify returned HTTP ${response.status}.`
    );
  }

  return (
    await response.json()
  ) as SourcifyResponse;
}

async function fetchSignatureCandidates(
  selector:
    Hex,

  fetchFn:
    FetchLike
): Promise<
  string[]
> {
  const url =
    "https://" +
    "www.4byte.directory/api/v1/signatures/?hex_signature=" +
    encodeURIComponent(
      selector
    );

  const response =
    await fetchFn(
      url,
      {
        headers: {
          accept:
            "application/json",
        },
      }
    );

  if (
    !response.ok
  ) {
    throw new Error(
      `Signature database returned HTTP ${response.status}.`
    );
  }

  const body =
    await response.json() as
      FourByteResponse;

  const signatures =
    (
      body.results ??
      []
    )
      .filter(
        (
          item
        ) =>
          item
            .hex_signature
            ?.toLowerCase() ===
          selector
            .toLowerCase()
      )
      .map(
        (
          item
        ) =>
          item
            .text_signature
            ?.trim()
      )
      .filter(
        (
          value
        ): value is
          string =>
          Boolean(
            value
          )
      );

  return [
    ...new Set(
      signatures
    ),
  ].slice(
    0,
    8
  );
}

export async function resolveContractIntelligence(
  input: {
    chainId:
      number;

    address:
      Address;

    calldata:
      Hex;
  },

  options?: {
    fetchFn?:
      FetchLike;
  }
): Promise<
  ContractIntelligence
> {
  const fetchFn =
    options?.fetchFn ??
    fetch;

  const selector =
    input.calldata ===
    "0x"
      ? null
      : (
          input.calldata.slice(
            0,
            10
          ) as Hex
        );

  let sourcify:
    SourcifyResponse |
    null =
      null;

  let sourcifyChecked =
    false;

  try {
    sourcifyChecked =
      true;

    sourcify =
      await fetchSourcify(
        input.chainId,
        input.address,
        fetchFn
      );
  } catch {
    /*
     * Contract identity enrichment must never
     * invalidate deterministic chain facts.
     */
  }

  const abi =
    sourcify?.abi;

  const matchedFunction =
    selector &&
    abi
      ? findFunctionBySelector(
          abi,
          selector
        )
      : null;

  if (
    matchedFunction &&
    selector
  ) {
    let decodedArguments:
      readonly unknown[] =
        [];

    try {
      const decoded =
        decodeFunctionData({
          abi: [
            matchedFunction,
          ],

          data:
            input.calldata,
        });

      decodedArguments =
        (
          decoded.args ??
          []
        ) as
          readonly unknown[];
    } catch {
      decodedArguments =
        [];
    }

    const args =
      matchedFunction.inputs.map(
        (
          abiInput,
          index
        ) => ({
          name:
            abiInput.name ||
            `arg${index}`,

          type:
            abiInput.type,

          value:
            normalizeDecodedValue(
              decodedArguments[
                index
              ]
            ),
        })
      );

    const implementations =
      (
        sourcify
          ?.proxyResolution
          ?.implementations ??
        []
      )
        .map(
          (
            implementation
          ) =>
            implementation
              .address
        )
        .filter(
          (
            address
          ): address is
            string =>
            Boolean(
              address
            )
        )
        .map(
          (
            address
          ) =>
            address as
              Address
        );

    return {
      version:
        CONTRACT_INTELLIGENCE_VERSION,

      contract: {
        address:
          input.address,

        chainId:
          input.chainId,

        verified:
          true,

        name:
          sourcify
            ?.compilation
            ?.name ??
          null,

        language:
          sourcify
            ?.compilation
            ?.language ??
          null,

        match:
          sourcify
            ?.match ??
          null,

        isProxy:
          sourcify
            ?.proxyResolution
            ?.isProxy ??
          false,

        implementations,
      },

      function: {
        selector,

        name:
          matchedFunction.name,

        signature:
          functionSignature(
            matchedFunction
          ),

        resolution:
          "verified_abi",

        confidence:
          "verified",

        arguments:
          args,

        alternativeSignatures:
          [],
      },

      evidence: {
        sourcifyChecked,

        sourcifyVerified:
          true,

        signatureDatabaseChecked:
          false,

        aiUsedForFacts:
          false,
      },
    };
  }

  let signatures:
    string[] =
      [];

  let signatureDatabaseChecked =
    false;

  if (
    selector
  ) {
    try {
      signatureDatabaseChecked =
        true;

      signatures =
        await fetchSignatureCandidates(
          selector,
          fetchFn
        );
    } catch {
      signatures =
        [];
    }
  }

  /*
   * A 4-byte selector is not globally unique.
   *
   * Only surface a candidate as the primary signature
   * when the database returned exactly one match.
   * Multiple matches remain explicitly ambiguous.
   */
  const primarySignature =
    signatures.length ===
    1
      ? signatures[0]!
      : null;

  const signatureAmbiguous =
    signatures.length >
    1;

  const name =
    primarySignature
      ?.split(
        "("
      )[0] ??
    null;

  const implementations =
    (
      sourcify
        ?.proxyResolution
        ?.implementations ??
      []
    )
      .map(
        (
          implementation
        ) =>
          implementation
            .address
      )
      .filter(
        (
          address
        ): address is
          string =>
          Boolean(
            address
          )
      )
      .map(
        (
          address
        ) =>
          address as
            Address
      );

  return {
    version:
      CONTRACT_INTELLIGENCE_VERSION,

    contract: {
      address:
        input.address,

      chainId:
        input.chainId,

      verified:
        Boolean(
          sourcify
        ),

      name:
        sourcify
          ?.compilation
          ?.name ??
        null,

      language:
        sourcify
          ?.compilation
          ?.language ??
        null,

      match:
        sourcify
          ?.match ??
        null,

      isProxy:
        sourcify
          ?.proxyResolution
          ?.isProxy ??
        false,

      implementations,
    },

    function: {
      selector,

      name,

      signature:
        primarySignature,

      resolution:
        primarySignature
          ? "signature_database"
          : signatureAmbiguous
            ? "signature_database_ambiguous"
            : "none",

      confidence:
        primarySignature
          ? "candidate"
          : "unknown",

      arguments:
        [],

      alternativeSignatures:
        primarySignature
          ? signatures.slice(
              1
            )
          : signatures,
    },

    evidence: {
      sourcifyChecked,

      sourcifyVerified:
        Boolean(
          sourcify
        ),

      signatureDatabaseChecked,

      aiUsedForFacts:
        false,
    },
  };
}
