import {
    getToolRequestHash,
    parseToolRequest,
    type ToolRequest,
} from "./request-bound.js";

import {
    type MppPaymentChallenge,
    type MppRequestAuthorization,
} from "./mpp-request-bound.js";


export type RuntimeGuardPlanRecord<
    TActivity = unknown
> = {
    id:
        string;

    createdAt:
        number;

    expiresAt:
        number;

    task:
        string;

    model:
        string;

    summary:
        string;

    request:
        ToolRequest;

    requestHash:
        `0x${string}`;

    activity:
        TActivity[];
};


export type GuardAuthorizationDraftRecord = {
    id:
        string;

    planId:
        string;

    createdAt:
        number;

    expiresAt:
        number;

    expectedSigner:
        `0x${string}`;

    request:
        ToolRequest;

    requestHash:
        `0x${string}`;

    authorization:
        MppRequestAuthorization;

    quotedPayment:
        MppPaymentChallenge;

    quotedChallengeId:
        string;
};


export function buildRuntimeGuardPlanRecord<
    TActivity = unknown
>(
    input: {
        id:
            string;

        now:
            number;

        lifetimeMs:
            number;

        task:
            string;

        request:
            unknown;

        model:
            string;

        summary:
            string;

        activity:
            TActivity[];
    }
):
    RuntimeGuardPlanRecord<TActivity> {
    const request =
        parseToolRequest(
            input.request
        );

    const requestHash =
        getToolRequestHash(
            request
        );

    return {
        id:
            input.id,

        createdAt:
            input.now,

        expiresAt:
            input.now +
            input.lifetimeMs,

        task:
            input.task,

        model:
            input.model,

        summary:
            input.summary,

        request,

        requestHash,

        activity:
            input.activity,
    };
}


export function buildGuardAuthorizationDraft(
    input: {
        plan: {
            id:
                string;

            expiresAt:
                number;

            request:
                ToolRequest;

            requestHash:
                `0x${string}`;
        };

        expectedSigner:
            `0x${string}`;

        quote: {
            payment:
                MppPaymentChallenge;

            challengeId:
                string;
        };

        authorizationId:
            string;

        now:
            number;

        draftLifetimeMs:
            number;

        userAuthorizationLifetimeMs:
            number;
    }
): {
    draft:
        GuardAuthorizationDraftRecord;

    authorization:
        MppRequestAuthorization;
} {
    const validUntil =
        Math.min(
            input.now +
                input.userAuthorizationLifetimeMs,
            input.plan.expiresAt
        );

    const authorization:
        MppRequestAuthorization = {
        authorizationId:
            input.authorizationId,

        requestHash:
            input.plan.requestHash,

        toolId:
            input.plan.request.toolId,

        method:
            input.plan.request.method,

        chainId:
            input.quote.payment.chainId,

        paymentToken:
            input.quote.payment.currency,

        paymentRecipient:
            input.quote.payment.recipient,

        maxAmountRaw:
            input.quote.payment.amount,

        credentialType:
            "hash",

        validUntil,
    };

    const draft:
        GuardAuthorizationDraftRecord = {
        id:
            input.authorizationId,

        planId:
            input.plan.id,

        createdAt:
            input.now,

        expiresAt:
            Math.min(
                input.now +
                    input.draftLifetimeMs,
                validUntil
            ),

        expectedSigner:
            input.expectedSigner,

        request:
            input.plan.request,

        requestHash:
            input.plan.requestHash,

        authorization,

        quotedPayment:
            input.quote.payment,

        quotedChallengeId:
            input.quote.challengeId,
    };

    return {
        draft,
        authorization,
    };
}
