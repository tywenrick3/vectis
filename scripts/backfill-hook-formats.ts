#!/usr/bin/env tsx

// Vectis: Backfill hook_format / hook_text on existing pipeline_runs.
// Idempotent — only touches rows where hook_format is null.
// Usage: tsx scripts/backfill-hook-formats.ts [--dry-run]

import { getDb } from "../packages/shared/src/index.js";
import { classifyHookFormat } from "../packages/ideation/src/hook-format.js";

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

const dryRun = process.argv.includes("--dry-run");

async function main(): Promise<void> {
  const db = getDb();

  console.log(bold("Backfilling hook_format / hook_text on pipeline_runs"));
  if (dryRun) console.log(yellow("DRY RUN — no writes will be made\n"));

  // Fetch all runs missing hook_format
  const { data: runs, error } = await db
    .from("pipeline_runs")
    .select("id, script_id, hook_format")
    .is("hook_format", null);

  if (error) {
    console.error(red(`Failed to fetch runs: ${error.message}`));
    process.exit(1);
  }

  if (!runs || runs.length === 0) {
    console.log(green("Nothing to backfill — all runs already have hook_format."));
    return;
  }

  console.log(`Found ${bold(String(runs.length))} runs to backfill.\n`);

  const runsWithScripts = runs.filter(
    (r): r is { id: string; script_id: string; hook_format: null } => !!r.script_id
  );
  const scriptIds = runsWithScripts.map((r) => r.script_id);

  // Batch-fetch script hooks
  const { data: scripts, error: scriptsError } = await db
    .from("scripts")
    .select("id, hook")
    .in("id", scriptIds);

  if (scriptsError) {
    console.error(red(`Failed to fetch scripts: ${scriptsError.message}`));
    process.exit(1);
  }

  const hookByScript = new Map((scripts ?? []).map((s) => [s.id, s.hook as string]));

  // Distribution counter for the summary
  const formatCounts = new Map<string, number>();

  let updated = 0;
  let skipped = 0;

  for (const run of runsWithScripts) {
    const hook = hookByScript.get(run.script_id);
    if (!hook) {
      skipped++;
      console.log(`  ${dim(`[${run.id}]`)} ${yellow("skip")} — script not found`);
      continue;
    }

    const format = classifyHookFormat(hook);
    formatCounts.set(format, (formatCounts.get(format) ?? 0) + 1);

    const preview = hook.length > 60 ? hook.slice(0, 57) + "..." : hook;
    console.log(`  ${dim(`[${run.id}]`)} ${green(format.padEnd(12))} ${dim(`"${preview}"`)}`);

    if (!dryRun) {
      const { error: updateError } = await db
        .from("pipeline_runs")
        .update({
          hook_text: hook,
          hook_format: format,
          hook_variant_index: 0,
        })
        .eq("id", run.id);

      if (updateError) {
        console.error(red(`    update failed: ${updateError.message}`));
        skipped++;
        continue;
      }
    }
    updated++;
  }

  // Runs with no script_id at all
  const orphaned = runs.length - runsWithScripts.length;
  if (orphaned > 0) {
    console.log(`\n${yellow(`${orphaned} runs had no script_id — skipped.`)}`);
  }

  console.log(`\n${bold("Summary")}`);
  console.log(`  ${green(`${updated} updated`)}${dryRun ? dim(" (dry run — no writes)") : ""}`);
  if (skipped > 0) console.log(`  ${yellow(`${skipped} skipped`)}`);

  if (formatCounts.size > 0) {
    console.log(`\n${bold("Hook format distribution")}`);
    const sorted = [...formatCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [format, count] of sorted) {
      console.log(`  ${format.padEnd(14)} ${count}`);
    }
  }
}

main().catch((err) => {
  console.error(red(`\nBackfill failed: ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
});
