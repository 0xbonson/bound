import {
    appendFile,
    mkdir,
    readFile,
} from "node:fs/promises";

import {
    randomUUID,
} from "node:crypto";

import {
    dirname,
} from "node:path";


export const BOUND_ACTIVITY_VERSION =
    "bound.activity.v1" as const;


export type BoundActivityKind =
    | "ANALYZED"
    | "AGENT_RUN"
    | "AUTHORIZED"
    | "ANCHORED"
    | "ALLOWED"
    | "BLOCKED";


export type BoundActivitySubject = {
    transactionHash:
        string;

    network:
        string;

    chainId:
        number;
};


export type BoundActivityEvent = {
    version:
        typeof BOUND_ACTIVITY_VERSION;

    id:
        string;

    kind:
        BoundActivityKind;

    createdAt:
        number;

    subject?:
        BoundActivitySubject;

    planId?:
        string;

    authorizationId?:
        string;

    requestHash?:
        string;

    actualRequestHash?:
        string;

    signer?:
        string;

    intentId?:
        string;

    anchorTransactionHash?:
        string;

    blockNumber?:
        string;

    paymentTxHash?:
        string;

    status?:
        string;

    scenario?:
        string;

    decision?:
        string;

    payerInvoked?:
        boolean;

    paymentBroadcast?:
        boolean;
};


export type BoundActivityInput =
    Omit<
        BoundActivityEvent,
        "version" |
        "id" |
        "createdAt"
    > & {
        createdAt?:
            number;
    };


function isActivityEvent(
    value:
        unknown
):
    value is
        BoundActivityEvent {

    if (
        typeof value !==
            "object" ||
        value ===
            null ||
        Array.isArray(
            value
        )
    ) {
        return false;
    }

    const record =
        value as
            Record<
                string,
                unknown
            >;

    return (
        record.version ===
            BOUND_ACTIVITY_VERSION &&
        typeof record.id ===
            "string" &&
        typeof record.kind ===
            "string" &&
        typeof record.createdAt ===
            "number"
    );
}


export class BoundActivityHistoryStore {
    readonly filePath:
        string;


    constructor(
        filePath:
            string =
                process.env
                    .BOUND_ACTIVITY_HISTORY_PATH
                    ?.trim() ||
                ".bound/activity/events.jsonl"
    ) {
        this.filePath =
            filePath;
    }


    async append(
        input:
            BoundActivityInput
    ):
        Promise<
            BoundActivityEvent
        > {

        const event:
            BoundActivityEvent = {
                version:
                    BOUND_ACTIVITY_VERSION,

                id:
                    randomUUID(),

                createdAt:
                    input.createdAt ??
                    Date.now(),

                ...input,
            };


        await mkdir(
            dirname(
                this.filePath
            ),
            {
                recursive:
                    true,
            }
        );


        await appendFile(
            this.filePath,
            `${JSON.stringify(
                event
            )}\n`,
            {
                encoding:
                    "utf8",

                flag:
                    "a",
            }
        );


        return event;
    }


    async list(
        requestedLimit:
            number =
                200
    ):
        Promise<
            BoundActivityEvent[]
        > {

        const limit =
            Math.max(
                1,
                Math.min(
                    500,
                    Math.floor(
                        requestedLimit
                    )
                )
            );


        let raw:
            string;

        try {
            raw =
                await readFile(
                    this.filePath,
                    "utf8"
                );
        } catch (
            error
        ) {
            if (
                (
                    error as
                        NodeJS.ErrnoException
                ).code ===
                "ENOENT"
            ) {
                return [];
            }

            throw error;
        }


        const events:
            BoundActivityEvent[] =
                [];


        for (
            const line of
                raw.split(
                    "\n"
                )
        ) {
            const trimmed =
                line.trim();

            if (
                trimmed.length ===
                0
            ) {
                continue;
            }


            try {
                const parsed:
                    unknown =
                        JSON.parse(
                            trimmed
                        );

                if (
                    isActivityEvent(
                        parsed
                    )
                ) {
                    events.push(
                        parsed
                    );
                }
            } catch {
                /*
                 * One malformed line must not make
                 * the whole product history unreadable.
                 */
            }
        }


        return events
            .sort(
                (
                    left,
                    right
                ) =>
                    right.createdAt -
                    left.createdAt
            )
            .slice(
                0,
                limit
            );
    }
}
