import {
  generateKeyPairSync,
  randomUUID,
} from "node:crypto";

import {
  createServer,
} from "node:http";

import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";

import {
  privateKeyToAccount,
} from "viem/accounts";

import {
  type NativeEvidence,
  signNativeEvidence,
} from "../core/native.js";

const PORT =
  Number(
    process.env.NATIVE_TOOL_PORT ??
    "8788"
  );

const SOURCE_ID =
  "native-market-report-tool";

const RESOURCE_ID =
  "bnb-market-report";

const CHAIN_ID = 97;

const ASSET_SYMBOL =
  "tBNB";

/*
 * 0.001 tBNB
 */
const PRICE_WEI =
  "1000000000000000";

const TOOL_DIRECTORY =
  ".bound/native-tool";

const PRIVATE_KEY_PATH =
  `${TOOL_DIRECTORY}/private.pem`;

const PUBLIC_KEY_PATH =
  `${TOOL_DIRECTORY}/public.pem`;

const VENDOR_PRIVATE_KEY_PATH =
  ".bound/vendor/private-key";

async function ensureToolKeys():
Promise<{
  privateKeyPem:
    string;

  publicKeyPem:
    string;
}> {
  try {
    const [
      privateKeyPem,
      publicKeyPem,
    ] =
      await Promise.all([
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
  } catch (
    error
  ) {
    const nodeError =
      error as NodeJS.ErrnoException;

    if (
      nodeError.code !==
      "ENOENT"
    ) {
      throw error;
    }
  }

  await mkdir(
    TOOL_DIRECTORY,
    {
      recursive:
        true,
    }
  );

  const {
    privateKey,
    publicKey,
  } =
    generateKeyPairSync(
      "ed25519"
    );

  const privateKeyPem =
    privateKey
      .export({
        format:
          "pem",

        type:
          "pkcs8",
      })
      .toString();

  const publicKeyPem =
    publicKey
      .export({
        format:
          "pem",

        type:
          "spki",
      })
      .toString();

  await writeFile(
    PRIVATE_KEY_PATH,
    privateKeyPem,
    {
      encoding:
        "utf8",

      mode:
        0o600,

      flag:
        "wx",
    }
  );

  await writeFile(
    PUBLIC_KEY_PATH,
    publicKeyPem,
    {
      encoding:
        "utf8",

      mode:
        0o644,

      flag:
        "wx",
    }
  );

  return {
    privateKeyPem,
    publicKeyPem,
  };
}

async function getVendorAddress():
Promise<`0x${string}`> {
  const privateKey =
    (
      await readFile(
        VENDOR_PRIVATE_KEY_PATH,
        "utf8"
      )
    ).trim();

  if (
    !/^0x[0-9a-fA-F]{64}$/.test(
      privateKey
    )
  ) {
    throw new Error(
      "Vendor wallet private key is missing or malformed. Run npm run vendor-create first."
    );
  }

  return privateKeyToAccount(
    privateKey as `0x${string}`
  ).address;
}

function sendJson(
  response:
    import("node:http").ServerResponse,

  status:
    number,

  value:
    unknown
) {
  response.statusCode =
    status;

  response.setHeader(
    "content-type",
    "application/json; charset=utf-8"
  );

  response.end(
    JSON.stringify(
      value
    )
  );
}

async function readJsonBody(
  request:
    import("node:http").IncomingMessage
): Promise<unknown> {
  const chunks:
    Buffer[] = [];

  let totalBytes = 0;

  for await (
    const chunk of request
  ) {
    const buffer =
      Buffer.isBuffer(
        chunk
      )
        ? chunk
        : Buffer.from(
            chunk
          );

    totalBytes +=
      buffer.length;

    if (
      totalBytes >
      16 * 1024
    ) {
      throw new Error(
        "Request body too large."
      );
    }

    chunks.push(
      buffer
    );
  }

  if (
    chunks.length === 0
  ) {
    return {};
  }

  return JSON.parse(
    Buffer.concat(
      chunks
    ).toString(
      "utf8"
    )
  );
}

async function main() {
  const {
    privateKeyPem,
    publicKeyPem,
  } =
    await ensureToolKeys();

  const vendorAddress =
    await getVendorAddress();

  const server =
    createServer(
      async (
        request,
        response
      ) => {
        try {
          const url =
            new URL(
              request.url ??
              "/",
              `http://${request.headers.host ?? "127.0.0.1"}`
            );

          if (
            request.method ===
              "GET" &&
            url.pathname ===
              "/health"
          ) {
            sendJson(
              response,
              200,
              {
                status:
                  "ok",

                sourceId:
                  SOURCE_ID,

                asset:
                  ASSET_SYMBOL,

                chainId:
                  CHAIN_ID,
              }
            );

            return;
          }

          if (
            request.method ===
              "GET" &&
            url.pathname ===
              "/public-key"
          ) {
            sendJson(
              response,
              200,
              {
                sourceId:
                  SOURCE_ID,

                algorithm:
                  "Ed25519",

                publicKeyPem,
              }
            );

            return;
          }

          if (
            request.method ===
              "POST" &&
            url.pathname ===
              "/quote"
          ) {
            const body =
              await readJsonBody(
                request
              );

            if (
              typeof body !==
                "object" ||
              body === null ||
              !(
                "resourceId" in
                body
              ) ||
              body.resourceId !==
                RESOURCE_ID
            ) {
              sendJson(
                response,
                404,
                {
                  error:
                    "Unknown resource.",
                }
              );

              return;
            }

            const now =
              Date.now();

            const evidence:
              NativeEvidence = {
                sourceId:
                  SOURCE_ID,

                resourceId:
                  RESOURCE_ID,

                chainId:
                  CHAIN_ID,

                assetType:
                  "native",

                assetSymbol:
                  ASSET_SYMBOL,

                recipient:
                  vendorAddress,

                amountWei:
                  PRICE_WEI,

                nonce:
                  randomUUID(),

                issuedAt:
                  now,

                expiresAt:
                  now +
                  5 * 60 * 1000,
              };

            const envelope =
              signNativeEvidence(
                evidence,
                privateKeyPem
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
                      "0.001 tBNB",

                    amountWei:
                      PRICE_WEI,
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
                "Not found.",
            }
          );
        } catch (
          error
        ) {
          const message =
            error instanceof Error
              ? error.message
              : "Unknown server error.";

          sendJson(
            response,
            500,
            {
              error:
                message,
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
        `BOUND native market tool listening on http://127.0.0.1:${PORT}`
      );

      console.log(
        `Source: ${SOURCE_ID}`
      );

      console.log(
        `Vendor: ${vendorAddress}`
      );

      console.log(
        "Price: 0.001 tBNB"
      );

      console.log(
        `Public key: ${PUBLIC_KEY_PATH}`
      );

      console.log(
        "This tool creates signed BSC Testnet native-payment evidence."
      );
    }
  );
}

await main();
