import { getDb, createLogger } from "@vectis/shared";

const log = createLogger("analytics:scoring");

// 14-day half-life: a 14-day-old run counts ~50%, 28-day ~25%, 60-day ~5%.
const DECAY_HALF_LIFE_DAYS = 14;

// Composite weights. Retention is the strongest leading indicator we have, so
// it dominates. Engagement (likes/comments/shares per view) measures intent,
// reach (raw views) is a tiebreaker.
const WEIGHT_RETENTION = 0.5;
const WEIGHT_ENGAGEMENT = 0.3;
const WEIGHT_REACH = 0.2;

// Lookback window for the cohort that defines the percentile distribution.
const COHORT_LOOKBACK_DAYS = 90;

interface RunFeatures {
  pipeline_run_id: string;
  topic_id: string;
  platform: string;
  views: number;
  engagement_rate: number; // (likes + 2*comments + 3*shares) / max(views, 1)
  completion_rate: number | null;
  age_days: number;
}

interface ScoredRun extends RunFeatures {
  reach_pct: number;
  engagement_pct: number;
  retention_pct: number | null;
  composite: number; // pre-decay composite in 0..1
  final: number; // post-decay 0..1
}

/**
 * Recompute per-platform scores in topic_platform_scores plus a rollup in
 * topics.score (= max across platforms).
 *
 * Math (per platform cohort, 90-day window):
 *   retention_pct  = percentile rank of completion_rate
 *   engagement_pct = percentile rank of (likes + 2c + 3s) / max(views, 1)
 *   reach_pct      = percentile rank of views
 *   composite      = 0.5*retention + 0.3*engagement + 0.2*reach
 *                    (when retention is null, weights are renormalized over
 *                    just engagement and reach so legacy runs aren't zeroed)
 *   final          = composite * 0.5 ** (age_days / 14)
 *
 * Topic score = mean(final) of all that topic's runs on that platform, scaled to 0..100.
 *
 * Returns the number of (topic, platform) rows updated.
 */
export async function scoreTopics(): Promise<number> {
  const db = getDb();

  const cohortStart = new Date(
    Date.now() - COHORT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: snapshots, error } = await db
    .from("analytics_snapshots")
    .select(
      "pipeline_run_id, platform, views, likes, comments, shares, completion_rate, fetched_at"
    )
    .gte("fetched_at", cohortStart)
    .order("fetched_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch snapshots: ${error.message}`);
  if (!snapshots?.length) return 0;

  // Latest snapshot per (pipeline_run_id, platform). A single run can publish
  // to both YT and TT, so we key by the pair.
  const latestByRunPlatform = new Map<string, (typeof snapshots)[0]>();
  for (const s of snapshots) {
    const platform = s.platform ?? "unknown";
    const key = `${s.pipeline_run_id}::${platform}`;
    if (!latestByRunPlatform.has(key)) {
      latestByRunPlatform.set(key, { ...s, platform });
    }
  }

  // Pull pipeline_runs to get topic_id + completed_at (for age).
  const runIds = Array.from(
    new Set([...latestByRunPlatform.values()].map((s) => s.pipeline_run_id))
  );
  const { data: runs } = await db
    .from("pipeline_runs")
    .select("id, topic_id, completed_at, started_at")
    .in("id", runIds);

  if (!runs?.length) return 0;

  const runMeta = new Map<
    string,
    { topic_id: string | null; completed_at: string | null; started_at: string }
  >(
    runs.map((r) => [
      r.id,
      {
        topic_id: r.topic_id,
        completed_at: r.completed_at,
        started_at: r.started_at,
      },
    ])
  );

  // Build run features keyed by platform.
  const featuresByPlatform = new Map<string, RunFeatures[]>();
  const now = Date.now();
  for (const s of latestByRunPlatform.values()) {
    const meta = runMeta.get(s.pipeline_run_id);
    if (!meta?.topic_id) continue;
    if (!s.platform || s.platform === "unknown") continue;

    const reference = meta.completed_at ?? meta.started_at;
    const ageMs = Math.max(0, now - new Date(reference).getTime());
    const age_days = ageMs / (24 * 60 * 60 * 1000);

    const views = Number(s.views ?? 0);
    const likes = Number(s.likes ?? 0);
    const comments = Number(s.comments ?? 0);
    const shares = Number(s.shares ?? 0);
    const denom = Math.max(views, 1);
    const engagement_rate = (likes + 2 * comments + 3 * shares) / denom;

    const feature: RunFeatures = {
      pipeline_run_id: s.pipeline_run_id,
      topic_id: meta.topic_id,
      platform: s.platform,
      views,
      engagement_rate,
      completion_rate:
        s.completion_rate == null ? null : Number(s.completion_rate),
      age_days,
    };

    const bucket = featuresByPlatform.get(s.platform) ?? [];
    bucket.push(feature);
    featuresByPlatform.set(s.platform, bucket);
  }

  if (featuresByPlatform.size === 0) {
    log.info("No platform-tagged runs in cohort; nothing to score");
    return 0;
  }

  // Score each platform cohort independently.
  const scoredByPlatform = new Map<string, ScoredRun[]>();
  for (const [platform, features] of featuresByPlatform) {
    scoredByPlatform.set(platform, scoreCohort(features));
  }

  // Aggregate per (topic, platform).
  type Agg = { sum: number; count: number };
  const platformAgg = new Map<string, Map<string, Agg>>(); // platform -> topic -> agg
  for (const [platform, scored] of scoredByPlatform) {
    const topicAgg = new Map<string, Agg>();
    for (const run of scored) {
      const existing = topicAgg.get(run.topic_id) ?? { sum: 0, count: 0 };
      existing.sum += run.final;
      existing.count += 1;
      topicAgg.set(run.topic_id, existing);
    }
    platformAgg.set(platform, topicAgg);
  }

  // Write per-platform rows.
  let platformRows = 0;
  for (const [platform, topicAgg] of platformAgg) {
    for (const [topicId, agg] of topicAgg) {
      const score = Math.round((agg.sum / agg.count) * 100);
      const { error: upsertErr } = await db
        .from("topic_platform_scores")
        .upsert(
          {
            topic_id: topicId,
            platform,
            score,
            sample_count: agg.count,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "topic_id,platform" }
        );
      if (!upsertErr) platformRows++;
    }
  }

  // Roll up to topics.score = max across platforms.
  const maxByTopic = new Map<string, number>();
  for (const topicAgg of platformAgg.values()) {
    for (const [topicId, agg] of topicAgg) {
      const score = Math.round((agg.sum / agg.count) * 100);
      const prev = maxByTopic.get(topicId) ?? -1;
      if (score > prev) maxByTopic.set(topicId, score);
    }
  }
  let topicRows = 0;
  for (const [topicId, score] of maxByTopic) {
    const { error: updateError } = await db
      .from("topics")
      .update({ score })
      .eq("id", topicId);
    if (!updateError) topicRows++;
  }

  log.info(
    {
      platforms: platformAgg.size,
      platform_rows: platformRows,
      topic_rows: topicRows,
    },
    "Topic scores updated"
  );
  return topicRows;
}

/**
 * Score a single platform cohort: rank each run's reach/engagement/retention
 * by percentile within the cohort, combine, then apply time decay.
 */
function scoreCohort(features: RunFeatures[]): ScoredRun[] {
  const reachPct = percentileRanks(features.map((f) => f.views));
  const engagementPct = percentileRanks(features.map((f) => f.engagement_rate));

  // Retention is null-tolerant: ranks are computed only over runs that have
  // completion_rate, then sliced back into the original positions.
  const retentionIdx = features
    .map((f, i) => ({ i, r: f.completion_rate }))
    .filter((x): x is { i: number; r: number } => x.r != null);
  const retentionPctMap = new Map<number, number>();
  if (retentionIdx.length > 0) {
    const ranks = percentileRanks(retentionIdx.map((x) => x.r));
    retentionIdx.forEach((x, j) => retentionPctMap.set(x.i, ranks[j]));
  }

  return features.map((f, i) => {
    const reach_pct = reachPct[i];
    const engagement_pct = engagementPct[i];
    const retention_pct = retentionPctMap.get(i) ?? null;

    let composite: number;
    if (retention_pct != null) {
      composite =
        WEIGHT_RETENTION * retention_pct +
        WEIGHT_ENGAGEMENT * engagement_pct +
        WEIGHT_REACH * reach_pct;
    } else {
      // No retention — renormalize over the remaining two weights so legacy
      // runs aren't penalized for lacking data we never collected.
      const remaining = WEIGHT_ENGAGEMENT + WEIGHT_REACH;
      composite =
        (WEIGHT_ENGAGEMENT / remaining) * engagement_pct +
        (WEIGHT_REACH / remaining) * reach_pct;
    }

    const decay = Math.pow(0.5, f.age_days / DECAY_HALF_LIFE_DAYS);
    const final = composite * decay;

    return {
      ...f,
      reach_pct,
      engagement_pct,
      retention_pct,
      composite,
      final,
    };
  });
}

/**
 * Percentile rank for each value in `values`, returned in input order.
 * Uses the "average of ranks" tiebreaker so identical values get identical
 * ranks. Returns 0..1. A single-element input returns 0.5 (no information).
 */
export function percentileRanks(values: number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  if (n === 1) return [0.5];

  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);

  // Assign average rank across ties.
  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j < n - 1 && indexed[j + 1].v === indexed[i].v) j++;
    const avgRank = (i + j) / 2;
    for (let k = i; k <= j; k++) {
      ranks[indexed[k].i] = avgRank;
    }
    i = j + 1;
  }

  // Normalize to 0..1 over (n - 1) so the bottom is 0 and the top is 1.
  return ranks.map((r) => r / (n - 1));
}
