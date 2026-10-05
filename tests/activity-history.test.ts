import assert from "node:assert/strict";

import {
    mkdtemp,
    readFile,
    rm,
} from "node:fs/promises";

import {
    tmpdir,
} from "node:os";

import {
    join,
} from "node:path";

import test from "node:test";

import {
    BoundActivityHistoryStore,
} from "../src/core/activity-history.js";


test(
    "activity history persists events newest first",
    async () => {
        const directory =
            await mkdtemp(
                join(
                    tmpdir(),
                    "bound-activity-"
                )
            );

        try {
            const filePath =
                join(
                    directory,
                    "events.jsonl"
                );

            const store =
                new BoundActivityHistoryStore(
                    filePath
                );

            await store.append({
                kind:
                    "ANALYZED",

                createdAt:
                    100,

                subject: {
                    transactionHash:
                        "0xaaa",

                    network:
                        "BNB Smart Chain Testnet",

                    chainId:
                        97,
                },
            });

            await store.append({
                kind:
                    "ANCHORED",

                createdAt:
                    200,

                authorizationId:
                    "auth-1",

                requestHash:
                    "0xrequest",

                intentId:
                    "0xintent",

                anchorTransactionHash:
                    "0xanchor",

                blockNumber:
                    "123",
            });


            const history =
                await store.list();

            assert.equal(
                history.length,
                2
            );

            assert.equal(
                history[0]?.kind,
                "ANCHORED"
            );

            assert.equal(
                history[1]?.kind,
                "ANALYZED"
            );


            const raw =
                await readFile(
                    filePath,
                    "utf8"
                );

            assert.match(
                raw,
                /"bound\.activity\.v1"/
            );
        } finally {
            await rm(
                directory,
                {
                    recursive:
                        true,

                    force:
                        true,
                }
            );
        }
    }
);


test(
    "activity history ignores malformed lines",
    async () => {
        const directory =
            await mkdtemp(
                join(
                    tmpdir(),
                    "bound-activity-"
                )
            );

        try {
            const filePath =
                join(
                    directory,
                    "events.jsonl"
                );

            const store =
                new BoundActivityHistoryStore(
                    filePath
                );

            await store.append({
                kind:
                    "BLOCKED",

                createdAt:
                    300,

                decision:
                    "BLOCK",

                payerInvoked:
                    false,

                paymentBroadcast:
                    false,
            });

            const {
                appendFile,
            } =
                await import(
                    "node:fs/promises"
                );

            await appendFile(
                filePath,
                "not-json\n",
                "utf8"
            );


            const history =
                await store.list();

            assert.equal(
                history.length,
                1
            );

            assert.equal(
                history[0]?.kind,
                "BLOCKED"
            );
        } finally {
            await rm(
                directory,
                {
                    recursive:
                        true,

                    force:
                        true,
                }
            );
        }
    }
);
