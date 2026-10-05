import {
    encodeFunctionData,
    getAddress,
    keccak256,
    parseAbi,
    toBytes,
    type Address,
    type Hex,
} from "viem";

export const BOUND_INTENT_REGISTRY_CHAIN_ID =
    97;

export const BOUND_INTENT_REGISTRY_ADDRESS =
    getAddress(
        "0xc85EdD8C5084195c4781dEE49611989127cAdB6b"
    );

export const BOUND_INTENT_REGISTRY_ABI =
    parseAbi([
        "function commitIntent(bytes32 intentId, bytes32 requestHash, address paymentToken, address paymentRecipient, uint256 maxAmount, uint64 expiresAt)",
        "function isAuthorized(bytes32 intentId, address authorizer, bytes32 requestHash, address paymentToken, address paymentRecipient, uint256 amount) view returns (bool)",
    ]);

export type BoundIntentRegistryInput = {
    authorizationId:
        string;

    authorizer:
        string;

    requestHash:
        Hex;

    paymentToken:
        string;

    paymentRecipient:
        string;

    maxAmountRaw:
        string;

    validUntil:
        number;
};

export type BoundIntentRegistryCommit = {
    chainId:
        number;

    contract:
        Address;

    from:
        Address;

    intentId:
        Hex;

    requestHash:
        Hex;

    paymentToken:
        Address;

    paymentRecipient:
        Address;

    maxAmountRaw:
        string;

    expiresAt:
        string;

    data:
        Hex;
};

export function getBoundIntentId(
    authorizationId:
        string
): Hex {
    const normalized =
        authorizationId
            .trim()
            .toLowerCase();

    if (
        normalized.length ===
        0
    ) {
        throw new Error(
            "authorizationId cannot be empty."
        );
    }

    return keccak256(
        toBytes(
            `BOUND_INTENT_REGISTRY_V1:${normalized}`
        )
    );
}

export function buildBoundIntentRegistryCommit(
    input:
        BoundIntentRegistryInput
):
    BoundIntentRegistryCommit {
    const authorizer =
        getAddress(
            input.authorizer
        );

    const paymentToken =
        getAddress(
            input.paymentToken
        );

    const paymentRecipient =
        getAddress(
            input.paymentRecipient
        );

    const maxAmount =
        BigInt(
            input.maxAmountRaw
        );

    if (
        maxAmount <= 0n
    ) {
        throw new Error(
            "Registry max amount must be greater than zero."
        );
    }

    if (
        !Number.isFinite(
            input.validUntil
        )
    ) {
        throw new Error(
            "Registry authorization expiry is invalid."
        );
    }

    /*
     * Off-chain authorization timestamps are milliseconds.
     * Solidity block.timestamp is seconds.
     *
     * Floor is intentionally conservative: the on-chain
     * commitment can never outlive the signed authorization.
     */
    const expiresAt =
        BigInt(
            Math.floor(
                input.validUntil /
                1_000
            )
        );

    if (
        expiresAt <= 0n
    ) {
        throw new Error(
            "Registry authorization expiry must be positive."
        );
    }

    const intentId =
        getBoundIntentId(
            input.authorizationId
        );

    const data =
        encodeFunctionData({
            abi:
                BOUND_INTENT_REGISTRY_ABI,

            functionName:
                "commitIntent",

            args: [
                intentId,
                input.requestHash,
                paymentToken,
                paymentRecipient,
                maxAmount,
                expiresAt,
            ],
        });

    return {
        chainId:
            BOUND_INTENT_REGISTRY_CHAIN_ID,

        contract:
            BOUND_INTENT_REGISTRY_ADDRESS,

        from:
            authorizer,

        intentId,

        requestHash:
            input.requestHash,

        paymentToken,

        paymentRecipient,

        maxAmountRaw:
            maxAmount.toString(),

        expiresAt:
            expiresAt.toString(),

        data,
    };
}
