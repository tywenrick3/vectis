#!/usr/bin/env tsx

// Vectis gameplay CLI — download, normalize, and upload gameplay clips to the R2 pool.
// Usage: pnpm gameplay:refresh --tag <minecraft-parkour|subway-surfers> [--max-per-tag 5]
//        pnpm gameplay:refresh --all [--max-per-tag 5]

import {
  refreshPool,
  GAMEPLAY_TAGS,
  type GameplayTag,
} from "../packages/gameplay/src/index.js";

interface Args {
  tag: GameplayTag | null;
  all: boolean;
  maxPerTag: number;
  minDuration: number;
  maxDuration: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let tag: GameplayTag | null = null;
  let all = false;
  let maxPerTag = 5;
  let minDuration = 300;
  let maxDuration = 1800;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tag") {
      const next = argv[++i];
      if (next && (GAMEPLAY_TAGS as readonly string[]).includes(next)) {
        tag = next as GameplayTag;
      }
    } else if (a === "--all") {
      all = true;
    } else if (a === "--max-per-tag") {
      maxPerTag = Number(argv[++i]);
    } else if (a === "--min-duration") {
      minDuration = Number(argv[++i]);
    } else if (a === "--max-duration") {
      maxDuration = Number(argv[++i]);
    } else if (a === "--help" || a === "-h") {
      printUsage();
      process.exit(0);
    }
  }
  return { tag, all, maxPerTag, minDuration, maxDuration };
}

function printUsage(): void {
  console.log(
    `Usage: pnpm gameplay:refresh [--tag <${GAMEPLAY_TAGS.join("|")}> | --all] [--max-per-tag 5] [--min-duration 300] [--max-duration 1800]`,
  );
}

async function main(): Promise<void> {
  const { tag, all, maxPerTag, minDuration, maxDuration } = parseArgs();
  if (!tag && !all) {
    printUsage();
    process.exit(1);
  }
  const started = Date.now();
  const summary = await refreshPool({
    tag: tag ?? undefined,
    maxPerTag,
    minSourceDurationSec: minDuration,
    maxSourceDurationSec: maxDuration,
  });

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\nRefresh complete in ${elapsed}s\n`);
  console.log(
    `${"tag".padEnd(20)}  ${"discovered".padStart(10)}  ${"dup".padStart(5)}  ${"dur".padStart(5)}  ${"ingested".padStart(8)}  ${"failed".padStart(6)}`,
  );
  console.log("-".repeat(70));
  for (const s of summary.tags) {
    console.log(
      [
        s.tag.padEnd(20),
        String(s.discovered).padStart(10),
        String(s.skippedDuplicate).padStart(5),
        String(s.skippedDuration).padStart(5),
        String(s.ingested).padStart(8),
        String(s.failed).padStart(6),
      ].join("  "),
    );
  }
  console.log(
    `\nTotal ingested: ${summary.totalIngested}, total failed: ${summary.totalFailed}`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
