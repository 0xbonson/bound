import { createServer } from "node:http";
import {
  generateKeyPairSync,
  randomUUID,
} from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";

import {
  type Evidence,
  signEvidence,
} from "../core/bound.js";

/*
 * IMPORTANT:
 *
 * These are still LOCAL MVP values.
 *
 * TESTUSD is NOT a deployed token yet.
 * We are not claiming any blockchain execution at this stage.
 *
 * The purpose of this service is to prove that BOUND can consume
 * evidence produced by an independent external process instead
 * of evidence hard-coded inside the verifier.
 */

const PORT =
  Number(process.env.TOOL_PORT ?? "8787");

const SOURCE_ID =
  "market-report-tool";

const RESOURCE_ID =
  "bnb-market-report";

const CHAIN_ID = 97;

const TOKEN =
  "0x3333333333333333333333333333333333333333";

const RECIPIENT =
  "0x1111111111111111111111111111111111111111";

const AMOUNT_RAW =
  "250000";

/*
 * For the future demo token we are assuming six decimals:
 *
 * 250000 base units = 0.25 TESTUSD
 */
const TOKEN_DECIMALS = 6;

const KEY_DIRECTORY =
  ".bound/tool";

const PRIVATE_KEY_PATH =
  `${KEY_DIRECTORY}/private.pem`;

const PUBLIC_KEY_PATH =
  `${KEY_DIRECTORY}/public.pem`;

type ToolKeys = {
  privateKeyPem: string;
  publicKeyPem: string;
};

async function ensureToolKeys(): Promise<ToolKeys> {
  try {
    const [
      privateKeyPem,
      publicKeyPem,
    ] = await Promise.all([
      readFile(
        PRIVATE_KEY_PATH,
        "utf8"
      ),

      readFile(
        PUBLIC_KEY_PATH,
        "utf8"
      ),
    ]);

    return {
      privateKeyPem,
      publicKeyPem,
    };
  } catch {
    await mkdir(
      KEY_DIRECTORY,
      {
        recursive: true,
      }
    );

    const {
      publicKey,
      privateKey,
    } = generateKeyPairSync(
      "ed25519"
    );

    const privateKeyPem =
      privateKey
        .export({
          type: "pkcs8",
          format: "pem",
        })
        .toString();

    const publicKeyPem =
      publicKey
        .export({
          type: "spki",
          format: "pem",
        })
        .toString();

    await writeFile(
      PRIVATE_KEY_PATH,
      privateKeyPem,
      {
        mode: 0o600,
      }
    );

    await writeFile(
      PUBLIC_KEY_PATH,
      publicKeyPem,
      {
        mode: 0o644,
      }
    );

    return {
      privateKeyPem,
      publicKeyPem,
    };
  }
}

function sendJson(
  response: import("node:http").ServerResponse,
  status: number,
  body: unknown
) {
  response.writeHead(
    status,
    {
      "content-type":
        "application/json; charset=utf-8",

      "cache-control":
        "no-store",
    }
  );

  response.end(
    JSON.stringify(
      body,
      null,
      2
    )
  );
}

async function readJsonBody(
  request:
    import("node:http").IncomingMessage
): Promise<unknown> {
  const chunks: Buffer[] = [];

  let totalSize = 0;

  for await (
    const chunk of request
  ) {
    const buffer =
      Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk);

    totalSize +=
      buffer.length;

    if (
      totalSize > 16_384
    ) {
      throw new Error(
        "Request body too large."
      );
    }

    chunks.push(buffer);
  }

  if (
    chunks.length === 0
  ) {
    return {};
  }

  return JSON.parse(
    Buffer.concat(
      chunks
    ).toString("utf8")
  );
}

const keys =
  await ensureToolKeys();

const server =
  createServer(
    async (
      request,
      response
    ) => {
      try {
        const url =
          new URL(
            request.url ?? "/",
            `http://${request.headers.host ?? "localhost"}`
          );

        /*
         * Health check.
         */
        if (
          request.method === "GET" &&
          url.pathname === "/health"
        ) {
          sendJson(
            response,
            200,
            {
              status: "ok",
              sourceId:
                SOURCE_ID,
            }
          );

          return;
        }

        /*
         * Public key discovery.
         *
         * NOTE:
         * Merely downloading this key does NOT make it trusted.
         *
         * BOUND will later pin the public key separately.
         */
        if (
          request.method === "GET" &&
          url.pathname === "/public-key"
        ) {
          sendJson(
            response,
            200,
            {
              sourceId:
                SOURCE_ID,

              algorithm:
                "Ed25519",

              publicKeyPem:
                keys.publicKeyPem,
            }
          );

          return;
        }

        /*
         * Real tool endpoint.
         *
         * The caller asks this service for a quote/resource.
         *
         * The service returns the transaction-critical fields
         * as signed evidence.
         */
        if (
          request.method === "POST" &&
          url.pathname === "/quote"
        ) {
          const body =
            await readJsonBody(
              request
            ) as {
              resourceId?: unknown;
            };

          if (
            body.resourceId !==
            RESOURCE_ID
          ) {
            sendJson(
              response,
              404,
              {
                error:
                  "Unknown resource.",

                requested:
                  body.resourceId ??
                  null,
              }
            );

            return;
          }

          const now =
            Date.now();

          const evidence:
            Evidence = {
              sourceId:
                SOURCE_ID,

              resourceId:
                RESOURCE_ID,

              chainId:
                CHAIN_ID,

              token:
                TOKEN,

              recipient:
                RECIPIENT,

              amountRaw:
                AMOUNT_RAW,

              nonce:
                randomUUID(),

              issuedAt:
                now,

              expiresAt:
                now +
                5 * 60 * 1000,
            };

          const envelope =
            signEvidence(
              evidence,
              keys.privateKeyPem
            );

          sendJson(
            response,
            200,
            {
              resource: {
                id:
                  RESOURCE_ID,

                name:
                  "BNB Market Report",

                price: {
                  display:
                    "0.25 TESTUSD",

                  amountRaw:
                    AMOUNT_RAW,

                  decimals:
                    TOKEN_DECIMALS,
                },
              },

              envelope,
            }
          );

          return;
        }

        sendJson(
          response,
          404,
          {
            error:
              "Route not found.",
          }
        );
      } catch (error) {
        sendJson(
          response,
          500,
          {
            error:
              error instanceof Error
                ? error.message
                : "Unknown server error.",
          }
        );
      }
    }
  );

server.listen(
  PORT,
  "127.0.0.1",
  () => {
    console.log(
      `BOUND market tool listening on http://127.0.0.1:${PORT}`
    );

    console.log(
      `Source: ${SOURCE_ID}`
    );

    console.log(
      `Public key: ${PUBLIC_KEY_PATH}`
    );

    console.log(
      "TESTUSD is still a local placeholder. No blockchain claim is being made yet."
    );
  }
);
