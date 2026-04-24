#!/usr/bin/env tsx

// Vectis gameplay CLI — reconcile gameplay_clips rows against R2.
// HEAD-checks every non-retired row's r2_url; retires rows whose object is missing.
// Usage: pnpm tsx scripts/gameplay-reconcile.ts [--dry-run]

import { getDb, createLogger } from "../packages/shared/src/index.js";

const log = createLogger("gameplay:reconcile");

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const db = getDb();

  const { data, error } = await db
    .from("gameplay_clips")
    .select("id, tag, r2_url, last_used_at")
    .eq("retired", false);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  log.info({ total: rows.length, dryRun }, "reconciling");

  const missing: { id: string; tag: string; r2_url: string }[] = [];
  for (const row of rows) {
    const res = await fetch(row.r2_url, { method: "HEAD" }).catch(
      () => ({ ok: false, status: 0 }) as Response,
    );
    if (!res.ok) {
      missing.push({ id: row.id, tag: row.tag, r2_url: row.r2_url });
      log.info({ id: row.id, tag: row.tag, status: res.status }, "missing");
    }
  }

  if (missing.length === 0) {
    log.info("all rows present in R2");
    return;
  }

  if (dryRun) {
    log.info({ wouldRetire: missing.length }, "dry-run — not updating DB");
    return;
  }

  const ids = missing.map((m) => m.id);
  const { error: updErr } = await db
    .from("gameplay_clips")
    .update({ retired: true, notes: "auto-retired: R2 object missing" })
    .in("id", ids);
  if (updErr) throw new Error(updErr.message);

  log.info({ retired: ids.length }, "retired missing rows");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
