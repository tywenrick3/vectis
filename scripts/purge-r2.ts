#!/usr/bin/env tsx

// Vectis R2 Bucket Purge
// Deletes ALL objects from the configured R2 bucket.
// Usage: pnpm purge-r2 [--force]

import { listR2Objects, deleteFromR2Batch } from "@vectis/shared";
import * as readline from "node:readline";

// ── ANSI helpers ────────────────────────────────────────────────────

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

// ── Args ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const force = args.includes("--force");

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
${bold("Vectis R2 Bucket Purge")}

Deletes ${red("ALL")} objects from the configured R2 bucket.

${bold("Usage:")}
  pnpm purge-r2              ${dim("Interactive confirmation")}
  pnpm purge-r2 --force      ${dim("Skip confirmation")}
`);
  process.exit(0);
}

// ── Confirmation ────────────────────────────────────────────────────

async function confirm(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  return new Promise((resolve) => {
    rl.question(
      `\n${red(bold("WARNING:"))} This will ${red("permanently delete ALL objects")} from the R2 bucket.\nType ${bold('"yes"')} to confirm: `,
      (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase() === "yes");
      }
    );
  });
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const bucket = process.env.R2_BUCKET_NAME ?? "vectis";
  console.error(`\n${bold("R2 Bucket Purge")} ${dim(`(bucket: ${bucket})`)}\n`);

  if (!force) {
    const confirmed = await confirm();
    if (!confirmed) {
      console.error(yellow("\nAborted."));
      process.exit(1);
    }
  }

  const start = performance.now();
  let totalDeleted = 0;
  let totalErrors = 0;
  let batch: string[] = [];

  console.error(dim("\nListing objects..."));

  for await (const key of listR2Objects()) {
    batch.push(key);

    if (batch.length >= 1000) {
      const { deleted, errors } = await deleteFromR2Batch(batch);
      totalDeleted += deleted;
      totalErrors += errors.length;
      console.error(`  ${green("Deleted")} ${totalDeleted} objects...`);
      batch = [];
    }
  }

  // Flush remaining
  if (batch.length > 0) {
    const { deleted, errors } = await deleteFromR2Batch(batch);
    totalDeleted += deleted;
    totalErrors += errors.length;
  }

  const elapsed = ((performance.now() - start) / 1000).toFixed(1);

  console.error(`\n${bold("Done.")}`);
  console.error(`  ${green("Deleted:")} ${totalDeleted} objects`);
  if (totalErrors > 0) {
    console.error(`  ${red("Errors:")}  ${totalErrors}`);
  }
  console.error(`  ${dim(`Time: ${elapsed}s`)}\n`);

  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(red(`\nFatal: ${err instanceof Error ? err.message : err}`));
  process.exit(1);
});
