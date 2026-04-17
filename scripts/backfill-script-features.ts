#!/usr/bin/env tsx

// Vectis: Backfill script_features for existing scripts.
// Idempotent — by default skips scripts that already have a features row.
// Pass --force to recompute and upsert every script (use after rule changes).
// Usage: pnpm backfill-features [-- --dry-run] [-- --force]

import { getDb, type Script } from "../packages/shared/src/index.js";
import { extractScriptFeatures } from "../packages/ideation/src/features.js";

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

async function main(): Promise<void> {
  const db = getDb();

  console.log(bold("Backfilling script_features"));
  if (dryRun) console.log(yellow("DRY RUN — no writes"));
  if (force) console.log(yellow("FORCE — re-extracting every script, upserting on conflict"));
  console.log();

  const { data: existing, error: existingError } = await db
    .from("script_features")
    .select("script_id");

  if (existingError) {
    console.error(red(`Failed to fetch existing features: ${existingError.message}`));
    process.exit(1);
  }
  const already = new Set((existing ?? []).map((r) => r.script_id));

  const { data: scripts, error } = await db.from("scripts").select();
  if (error) {
    console.error(red(`Failed to fetch scripts: ${error.message}`));
    process.exit(1);
  }
  if (!scripts || scripts.length === 0) {
    console.log(green("No scripts found."));
    return;
  }

  const todo = force ? scripts : scripts.filter((s) => !already.has(s.id));
  console.log(
    `Scripts: ${scripts.length}, already-featured: ${already.size}, to-backfill: ${bold(String(todo.length))}\n`
  );

  if (todo.length === 0) {
    console.log(green("Nothing to backfill."));
    return;
  }

  const formatCounts = new Map<string, number>();
  let updated = 0;
  let failed = 0;

  for (const row of todo) {
    const script = row as Script;
    try {
      const features = extractScriptFeatures(script);
      formatCounts.set(
        features.hook_format,
        (formatCounts.get(features.hook_format) ?? 0) + 1
      );

      const preview =
        (script.hook ?? "").length > 50
          ? script.hook.slice(0, 47) + "..."
          : script.hook ?? "";
      console.log(
        `  ${dim(`[${script.id.slice(0, 8)}]`)} ${green(features.hook_format.padEnd(12))} ${dim(
          `segs=${features.segment_count} words=${features.word_count} cues=${features.visual_cue_variety}`
        )}  ${dim(`"${preview}"`)}`
      );

      if (!dryRun) {
        const { error: insertError } = await db
          .from("script_features")
          .upsert(
            {
              script_id: script.id,
              hook_format: features.hook_format,
              segment_count: features.segment_count,
              word_count: features.word_count,
              avg_segment_words: features.avg_segment_words,
              visual_cue_types: features.visual_cue_types,
              visual_cue_variety: features.visual_cue_variety,
              transition_variety: features.transition_variety,
              specificity_density: features.specificity_density,
              has_number_in_hook: features.has_number_in_hook,
              estimated_duration_ms: features.estimated_duration_ms,
            },
            { onConflict: "script_id" }
          );
        if (insertError) {
          console.error(red(`    upsert failed: ${insertError.message}`));
          failed++;
          continue;
        }
      }
      updated++;
    } catch (err) {
      failed++;
      console.error(
        red(`    extract failed for ${script.id}: ${err instanceof Error ? err.message : String(err)}`)
      );
    }
  }

  console.log(`\n${bold("Summary")}`);
  console.log(`  ${green(`${updated} updated`)}${dryRun ? dim(" (dry run)") : ""}`);
  if (failed > 0) console.log(`  ${red(`${failed} failed`)}`);

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
