#!/usr/bin/env tsx

// Vectis gameplay CLI — find candidate "no copyright" gameplay channels to seed TAG_CHANNELS.
// Usage: pnpm gameplay:find-channels --tag <minecraft-parkour|subway-surfers> [--max 25] [--query "custom query"]

import {
  findChannels,
  GAMEPLAY_TAGS,
  type GameplayTag,
} from "../packages/gameplay/src/index.js";

interface Args {
  tag: GameplayTag | null;
  max: number;
  query: string | undefined;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let tag: GameplayTag | null = null;
  let max = 25;
  let query: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tag") {
      const next = argv[++i];
      if (next && (GAMEPLAY_TAGS as readonly string[]).includes(next)) {
        tag = next as GameplayTag;
      }
    } else if (a === "--max") {
      max = Number(argv[++i]);
    } else if (a === "--query") {
      query = argv[++i];
    } else if (a === "--help" || a === "-h") {
      printUsage();
      process.exit(0);
    }
  }
  return { tag, max, query };
}

function printUsage(): void {
  console.log(
    `Usage: pnpm gameplay:find-channels --tag <${GAMEPLAY_TAGS.join("|")}> [--max 25] [--query "..."]`,
  );
}

function truncate(s: string, n: number): string {
  const oneLine = s.replace(/\s+/g, " ");
  return oneLine.length <= n ? oneLine : oneLine.slice(0, n - 1) + "…";
}

async function main(): Promise<void> {
  const { tag, max, query } = parseArgs();
  if (!tag) {
    printUsage();
    process.exit(1);
  }
  const channels = await findChannels({ tag, maxResults: max, query });
  if (channels.length === 0) {
    console.log("No channels found.");
    return;
  }
  console.log(`\n${channels.length} channels for ${tag}:\n`);
  const header = [
    "rank".padEnd(4),
    "flag".padEnd(4),
    "subs".padStart(10),
    "vids".padStart(6),
    "title".padEnd(32),
    "handle".padEnd(26),
    "description",
  ].join("  ");
  console.log(header);
  console.log("-".repeat(130));
  channels.forEach((c, i) => {
    const row = [
      String(i + 1).padEnd(4),
      (c.flagged ? "✓" : " ").padEnd(4),
      c.subscriberCount.toLocaleString().padStart(10),
      c.videoCount.toLocaleString().padStart(6),
      truncate(c.title, 32).padEnd(32),
      truncate(c.customUrl ?? c.channelId, 26).padEnd(26),
      truncate(c.description, 60),
    ].join("  ");
    console.log(row);
  });
  console.log("\nFlagged channel URLs (these match 'no copyright / free to use' patterns):");
  channels
    .filter((c) => c.flagged)
    .slice(0, 10)
    .forEach((c) => console.log(`  ${c.url}  (id=${c.channelId})`));
  console.log();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
