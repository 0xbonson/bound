// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title BOUNDIntentRegistry
 * @notice On-chain commitment registry for exact paid AI-agent actions.
 *
 * The registry does NOT:
 * - hold funds,
 * - transfer tokens,
 * - execute the transaction being analyzed,
 * - trade assets,
 * - decide whether an action is safe.
 *
 * A human authorizer commits the exact request and payment
 * boundary they approve. A payment layer can later verify
 * that nothing material changed before money moves.
 */
contract BOUNDIntentRegistry {
    struct Intent {
        address authorizer;
        bytes32 requestHash;
        address paymentToken;
        address paymentRecipient;
        uint256 maxAmount;
        uint64 expiresAt;
        bool revoked;
    }

    // Each authorizer owns an independent intent namespace.
    mapping(address => mapping(bytes32 => Intent))
        private intents;

    error ZeroIntentId();
    error ZeroRequestHash();
    error ZeroPaymentRecipient();
    error ZeroMaxAmount();
    error ExpiryNotInFuture();
    error IntentAlreadyExists(bytes32 intentId);
    error IntentNotFound(bytes32 intentId);
    error IntentAlreadyRevoked(bytes32 intentId);

    event IntentCommitted(
        bytes32 indexed intentId,
        address indexed authorizer,
        bytes32 indexed requestHash,
        address paymentToken,
        address paymentRecipient,
        uint256 maxAmount,
        uint64 expiresAt
    );

    event IntentRevoked(
        bytes32 indexed intentId,
        address indexed authorizer
    );

    /**
     * @notice Commit one exact paid-tool authorization.
     *
     * paymentToken == address(0) represents a native asset.
     */
    function commitIntent(
        bytes32 intentId,
        bytes32 requestHash,
        address paymentToken,
        address paymentRecipient,
        uint256 maxAmount,
        uint64 expiresAt
    ) external {
        if (intentId == bytes32(0)) {
            revert ZeroIntentId();
        }

        if (requestHash == bytes32(0)) {
            revert ZeroRequestHash();
        }

        if (paymentRecipient == address(0)) {
            revert ZeroPaymentRecipient();
        }

        if (maxAmount == 0) {
            revert ZeroMaxAmount();
        }

        if (expiresAt <= block.timestamp) {
            revert ExpiryNotInFuture();
        }

        if (
            intents[msg.sender][intentId]
                .requestHash != bytes32(0)
        ) {
            revert IntentAlreadyExists(intentId);
        }

        intents[msg.sender][intentId] = Intent({
            authorizer: msg.sender,
            requestHash: requestHash,
            paymentToken: paymentToken,
            paymentRecipient: paymentRecipient,
            maxAmount: maxAmount,
            expiresAt: expiresAt,
            revoked: false
        });

        emit IntentCommitted(
            intentId,
            msg.sender,
            requestHash,
            paymentToken,
            paymentRecipient,
            maxAmount,
            expiresAt
        );
    }

    /**
     * @notice Revoke one of the caller's commitments.
     */
    function revokeIntent(
        bytes32 intentId
    ) external {
        Intent storage intent =
            intents[msg.sender][intentId];

        if (intent.requestHash == bytes32(0)) {
            revert IntentNotFound(intentId);
        }

        if (intent.revoked) {
            revert IntentAlreadyRevoked(intentId);
        }

        intent.revoked = true;

        emit IntentRevoked(
            intentId,
            msg.sender
        );
    }

    /**
     * @notice Read one commitment.
     */
    function getIntent(
        address authorizer,
        bytes32 intentId
    )
        external
        view
        returns (Intent memory)
    {
        return intents[authorizer][intentId];
    }

    /**
     * @notice Verify that a proposed payment still matches
     * the exact committed request and payment boundary.
     *
     * This function never moves funds.
     */
    function isAuthorized(
        bytes32 intentId,
        address authorizer,
        bytes32 requestHash,
        address paymentToken,
        address paymentRecipient,
        uint256 amount
    )
        external
        view
        returns (bool)
    {
        Intent storage intent =
            intents[authorizer][intentId];

        return
            intent.requestHash != bytes32(0) &&
            intent.authorizer == authorizer &&
            intent.requestHash == requestHash &&
            intent.paymentToken == paymentToken &&
            intent.paymentRecipient ==
                paymentRecipient &&
            amount > 0 &&
            amount <= intent.maxAmount &&
            block.timestamp < intent.expiresAt &&
            !intent.revoked;
    }
}
