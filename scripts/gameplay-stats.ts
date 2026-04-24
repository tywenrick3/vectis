#!/usr/bin/env tsx

// Vectis gameplay CLI — show pool size and state per tag.
// Usage: pnpm gameplay:stats

import {
  getPoolStats,
  GAMEPLAY_TAGS,
} from "../packages/gameplay/src/index.js";

async function main(): Promise<void> {
  console.log();
  console.log(
    `${"tag".padEnd(20)}  ${"active".padStart(7)}  ${"avail now".padStart(9)}  ${"retired".padStart(7)}  ${"oldest".padStart(11)}  ${"newest".padStart(11)}`,
  );
  console.log("-".repeat(80));
  for (const tag of GAMEPLAY_TAGS) {
    const s = await getPoolStats(tag);
    console.log(
      [
        tag.padEnd(20),
        String(s.active).padStart(7),
        String(s.availableNow).padStart(9),
        String(s.retired).padStart(7),
        (s.oldestFetchedAt ?? "-").slice(0, 10).padStart(11),
        (s.newestFetchedAt ?? "-").slice(0, 10).padStart(11),
      ].join("  "),
    );
  }
  console.log();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
