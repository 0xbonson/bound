import {
  fetchTransactionFacts,
} from "../chain/transaction-intelligence.js";

async function main(): Promise<void> {
  const input = process.argv
    .slice(2)
    .join(" ")
    .trim();

  if (!input) {
    console.error(
      "Usage: npm run tx-inspect -- TX_HASH_OR_BSCSCAN_URL",
    );

    process.exitCode = 1;
    return;
  }

  const facts =
    await fetchTransactionFacts(input);

  console.log(
    JSON.stringify(
      facts,
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(
    "BOUND transaction inspection failed:",
  );

  console.error(
    error instanceof Error
      ? error.message
      : error,
  );

  process.exitCode = 1;
});
