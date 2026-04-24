#!/usr/bin/env tsx

// Vectis gameplay CLI — discover recent uploads from seeded "no copyright" channels per tag.
// Usage: pnpm gameplay:discover --tag <minecraft-parkour|subway-surfers>
//                                [--per-channel 5] [--days 30] [--min-duration 60]

import {
  discover,
  GAMEPLAY_TAGS,
  type GameplayTag,
} from "../packages/gameplay/src/index.js";

interface Args {
  tag: GameplayTag | null;
  perChannel: number;
  days: number;
  minDuration: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let tag: GameplayTag | null = null;
  let perChannel = 10;
  let days = 365;
  let minDuration = 0;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tag") {
      const next = argv[++i];
      if (next && (GAMEPLAY_TAGS as readonly string[]).includes(next)) {
        tag = next as GameplayTag;
      }
    } else if (a === "--per-channel") {
      perChannel = Number(argv[++i]);
    } else if (a === "--days") {
      days = Number(argv[++i]);
    } else if (a === "--min-duration") {
      minDuration = Number(argv[++i]);
    } else if (a === "--help" || a === "-h") {
      printUsage();
      process.exit(0);
    }
  }
  return { tag, perChannel, days, minDuration };
}

function printUsage(): void {
  console.log(
    `Usage: pnpm gameplay:discover --tag <${GAMEPLAY_TAGS.join("|")}> [--per-channel 10] [--days 365] [--min-duration 0]`,
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h${m.toString().padStart(2, "0")}m`;
  return `${m}m${s.toString().padStart(2, "0")}s`;
}

async function main(): Promise<void> {
  const { tag, perChannel, days, minDuration } = parseArgs();
  if (!tag) {
    printUsage();
    process.exit(1);
  }
  const candidates = await discover({
    tag,
    maxPerChannel: perChannel,
    publishedWithinDays: days,
    minDurationSec: minDuration,
  });
  if (candidates.length === 0) {
    console.log("No candidates found.");
    return;
  }
  const now = Date.now();
  console.log(`\n${candidates.length} candidates for ${tag} (sorted by duration desc):\n`);
  const header = [
    "rank".padEnd(4),
    "duration".padStart(9),
    "age(d)".padStart(7),
    "views".padStart(10),
    "channel".padEnd(30),
    "title",
  ].join("  ");
  console.log(header);
  console.log("-".repeat(130));
  candidates.forEach((c, i) => {
    const ageDays = (now - new Date(c.publishedAt).getTime()) / 86_400_000;
    const row = [
      String(i + 1).padEnd(4),
      formatDuration(c.durationSec).padStart(9),
      ageDays.toFixed(1).padStart(7),
      c.views.toLocaleString().padStart(10),
      truncate(c.channel, 30).padEnd(30),
      truncate(c.title, 60),
    ].join("  ");
    console.log(row);
  });
  console.log("\nTop URLs:");
  candidates.slice(0, 5).forEach((c) => console.log(`  ${c.url}`));
  console.log();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
