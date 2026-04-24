import { getDb, createLogger } from "@vectis/shared";
import type { GameplayTag } from "./types.js";

const log = createLogger("gameplay:pool");

const COOLDOWN_DAYS = 7;

export interface ClipInsert {
  tag: GameplayTag;
  sourceVideoId: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceChannel: string;
  sourcePublishedAt: string;
  sourceDurationSec: number;
  clipDurationSec: number;
  viewsAtIngest: number;
  score: number;
  r2Key: string;
  r2Url: string;
  normalizedWidth: number;
  normalizedHeight: number;
  wasPreVertical: boolean;
}

export async function existsByVideoId(videoId: string): Promise<boolean> {
  const db = getDb();
  const { data, error } = await db
    .from("gameplay_clips")
    .select("id")
    .eq("source_video_id", videoId)
    .maybeSingle();
  if (error) {
    log.warn({ videoId, err: error.message }, "existsByVideoId query failed");
    return false;
  }
  return data !== null;
}

export async function insertClip(clip: ClipInsert): Promise<string> {
  const db = getDb();
  const { data, error } = await db
    .from("gameplay_clips")
    .insert({
      tag: clip.tag,
      source_video_id: clip.sourceVideoId,
      source_url: clip.sourceUrl,
      source_title: clip.sourceTitle,
      source_channel: clip.sourceChannel,
      source_published_at: clip.sourcePublishedAt,
      source_duration_sec: clip.sourceDurationSec,
      clip_duration_sec: clip.clipDurationSec,
      views_at_ingest: clip.viewsAtIngest,
      score: clip.score,
      r2_key: clip.r2Key,
      r2_url: clip.r2Url,
      normalized_width: clip.normalizedWidth,
      normalized_height: clip.normalizedHeight,
      was_pre_vertical: clip.wasPreVertical,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`insertClip failed: ${error?.message ?? "no row returned"}`);
  }
  return data.id as string;
}

export interface PickResult {
  clipId: string;
  tag: GameplayTag;
  r2Url: string;
  startSec: number;
  durationSec: number;
}

export interface PickOptions {
  tag: GameplayTag;
  durationSec: number;
}

/**
 * Pick a clip whose file window can cover `durationSec` of playback.
 * LRU with 7-day cooldown (never-used first, then oldest-used). Updates last_used_at + use_count.
 * Self-healing: if the chosen row's R2 object is missing, retires the row and re-picks.
 * Returns null if no clip in this tag can serve the duration.
 */
export async function pickClip(opts: PickOptions): Promise<PickResult | null> {
  const { tag, durationSec } = opts;
  const db = getDb();
  const cooldown = new Date(
    Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const minClipDuration = Math.ceil(durationSec) + 2;
  const excluded: string[] = [];

  while (true) {
    let query = db
      .from("gameplay_clips")
      .select("id, r2_url, clip_duration_sec, last_used_at, score, use_count")
      .eq("tag", tag)
      .eq("retired", false)
      .gte("clip_duration_sec", minClipDuration)
      .or(`last_used_at.is.null,last_used_at.lt.${cooldown}`)
      .order("last_used_at", { ascending: true, nullsFirst: true })
      .order("score", { ascending: false })
      .limit(1);
    if (excluded.length > 0) {
      query = query.not("id", "in", `(${excluded.join(",")})`);
    }
    const { data, error } = await query;

    if (error) {
      log.warn({ tag, err: error.message }, "pickClip query failed");
      return null;
    }
    const row = data?.[0];
    if (!row) {
      log.info({ tag, durationSec }, "no eligible clip in pool");
      return null;
    }

    const r2Url = row.r2_url as string;
    if (!(await headOk(r2Url))) {
      log.warn({ clipId: row.id, r2Url }, "clip missing from R2, retiring");
      await db
        .from("gameplay_clips")
        .update({ retired: true, notes: "auto-retired: R2 object missing" })
        .eq("id", row.id as string);
      excluded.push(row.id as string);
      continue;
    }

    const clipDurationSec = row.clip_duration_sec as number;
    const maxStart = Math.max(0, clipDurationSec - Math.ceil(durationSec) - 1);
    const startSec = maxStart > 0 ? Math.floor(Math.random() * maxStart) : 0;

    await db
      .from("gameplay_clips")
      .update({
        last_used_at: new Date().toISOString(),
        use_count: (row.use_count as number) + 1,
      })
      .eq("id", row.id as string);

    const result: PickResult = {
      clipId: row.id as string,
      tag,
      r2Url,
      startSec,
      durationSec,
    };
    log.info(result, "picked clip");
    return result;
  }
}

async function headOk(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

export interface PoolStats {
  tag: GameplayTag;
  active: number;
  retired: number;
  oldestFetchedAt: string | null;
  newestFetchedAt: string | null;
  availableNow: number;
}

export async function getPoolStats(tag: GameplayTag): Promise<PoolStats> {
  const db = getDb();
  const { data, error } = await db
    .from("gameplay_clips")
    .select("retired, fetched_at, last_used_at")
    .eq("tag", tag);
  if (error) throw new Error(`getPoolStats failed: ${error.message}`);
  const rows = data ?? [];
  const active = rows.filter((r) => !r.retired).length;
  const retired = rows.filter((r) => r.retired).length;
  const cooldown = Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  const availableNow = rows.filter((r) => {
    if (r.retired) return false;
    if (!r.last_used_at) return true;
    return new Date(r.last_used_at as string).getTime() < cooldown;
  }).length;
  const dates = rows.map((r) => r.fetched_at as string).sort();
  return {
    tag,
    active,
    retired,
    oldestFetchedAt: dates[0] ?? null,
    newestFetchedAt: dates[dates.length - 1] ?? null,
    availableNow,
  };
}
