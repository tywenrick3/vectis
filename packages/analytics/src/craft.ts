import { getDb, createLogger } from "@vectis/shared";

const log = createLogger("analytics:craft");

export interface CraftBucket {
  sample_count: number;
  hook_formats: { format: string; count: number }[];
  segment_count_median: number;
  word_count_median: number;
  specificity_density_median: number;
  transition_variety_median: number;
  visual_cue_types: string[]; // cue types appearing in ≥50% of scripts in this bucket
}

export interface CraftPatterns {
  niche: string;
  sample_count: number;
  winning: CraftBucket | null;
  losing: CraftBucket | null;
  niche_averages: {
    segment_count: number;
    word_count: number;
    specificity_density: number;
  } | null;
}

interface FeatureRow {
  script_id: string;
  hook_format: string | null;
  segment_count: number;
  word_count: number;
  visual_cue_types: string[];
  visual_cue_variety: number;
  transition_variety: number;
  specificity_density: number;
}

interface EnrichedFeature extends FeatureRow {
  performance: number; // higher = better
}

const EMPTY: CraftPatterns = {
  niche: "",
  sample_count: 0,
  winning: null,
  losing: null,
  niche_averages: null,
};

/**
 * Aggregates script-craft features for a niche, split into winning and
 * losing buckets by performance (completion_rate when available, topics.score
 * as fallback). Used by the `craft_lookup` tool in the ideation agent.
 */
export async function getCraftPatterns(niche: string): Promise<CraftPatterns> {
  const db = getDb();

  // 1. Topics for this niche that have been published
  const { data: topics } = await db
    .from("topics")
    .select("id, score")
    .eq("niche", niche)
    .eq("used", true);

  if (!topics || topics.length === 0) return { ...EMPTY, niche };

  const topicIds = topics.map((t) => t.id);
  const topicScoreById = new Map(topics.map((t) => [t.id, t.score as number]));

  // 2. Scripts for those topics
  const { data: scripts } = await db
    .from("scripts")
    .select("id, topic_id")
    .in("topic_id", topicIds);

  if (!scripts || scripts.length === 0) return { ...EMPTY, niche };

  const scriptIds = scripts.map((s) => s.id);
  const topicByScript = new Map(scripts.map((s) => [s.id, s.topic_id as string]));

  // 3. Features for those scripts
  const { data: features } = await db
    .from("script_features")
    .select(
      "script_id, hook_format, segment_count, word_count, visual_cue_types, visual_cue_variety, transition_variety, specificity_density"
    )
    .in("script_id", scriptIds);

  if (!features || features.length === 0) return { ...EMPTY, niche };

  // 4. Pipeline runs → latest analytics snapshot per run → avg completion per script
  const { data: runs } = await db
    .from("pipeline_runs")
    .select("id, script_id")
    .in("script_id", scriptIds);

  const runIds = (runs ?? []).map((r) => r.id);
  const runToScript = new Map((runs ?? []).map((r) => [r.id, r.script_id as string]));

  const completionByScript = new Map<string, number[]>();
  if (runIds.length > 0) {
    const { data: snapshots } = await db
      .from("analytics_snapshots")
      .select("pipeline_run_id, completion_rate, fetched_at")
      .in("pipeline_run_id", runIds)
      .not("completion_rate", "is", null)
      .order("fetched_at", { ascending: false });

    const seenRuns = new Set<string>();
    for (const s of snapshots ?? []) {
      if (seenRuns.has(s.pipeline_run_id)) continue; // first = latest
      seenRuns.add(s.pipeline_run_id);
      const scriptId = runToScript.get(s.pipeline_run_id);
      if (!scriptId) continue;
      const existing = completionByScript.get(scriptId) ?? [];
      existing.push(Number(s.completion_rate));
      completionByScript.set(scriptId, existing);
    }
  }

  // 5. Build enriched features with a performance number.
  // Prefer completion_rate (0-1). If a script has no retention data, fall back
  // to topics.score / 100 so it's on the same scale.
  const enriched: EnrichedFeature[] = features.map((f) => {
    const fr = f as FeatureRow;
    const completions = completionByScript.get(fr.script_id) ?? [];
    let performance: number;
    if (completions.length > 0) {
      performance = completions.reduce((a, b) => a + b, 0) / completions.length;
    } else {
      const topicId = topicByScript.get(fr.script_id);
      const score = topicId ? (topicScoreById.get(topicId) ?? 0) : 0;
      performance = score / 100;
    }
    return { ...fr, performance };
  });

  // 6. Niche averages (across all features, independent of bucket split)
  const niche_averages = {
    segment_count: Math.round(mean(enriched.map((e) => e.segment_count))),
    word_count: Math.round(mean(enriched.map((e) => e.word_count))),
    specificity_density:
      Math.round(mean(enriched.map((e) => e.specificity_density)) * 100) / 100,
  };

  // 7. Median split — need at least 4 samples to even try
  if (enriched.length < 4) {
    log.info(
      { niche, sampleCount: enriched.length },
      "Too few samples for winning/losing split"
    );
    return {
      niche,
      sample_count: enriched.length,
      winning: null,
      losing: null,
      niche_averages,
    };
  }

  const sorted = [...enriched].sort((a, b) => b.performance - a.performance);
  const half = Math.floor(sorted.length / 2);
  const winners = sorted.slice(0, half);
  const losers = sorted.slice(-half);

  log.info(
    { niche, samples: enriched.length, winners: winners.length, losers: losers.length },
    "Craft patterns built"
  );

  return {
    niche,
    sample_count: enriched.length,
    winning: buildBucket(winners),
    losing: buildBucket(losers),
    niche_averages,
  };
}

function buildBucket(items: EnrichedFeature[]): CraftBucket {
  const formatCounts = new Map<string, number>();
  for (const item of items) {
    if (!item.hook_format) continue;
    formatCounts.set(item.hook_format, (formatCounts.get(item.hook_format) ?? 0) + 1);
  }
  const hook_formats = [...formatCounts.entries()]
    .map(([format, count]) => ({ format, count }))
    .sort((a, b) => b.count - a.count);

  // Visual cue types appearing in at least half of the scripts in this bucket
  const cueFreq = new Map<string, number>();
  for (const item of items) {
    const unique = new Set(item.visual_cue_types ?? []);
    for (const cue of unique) {
      cueFreq.set(cue, (cueFreq.get(cue) ?? 0) + 1);
    }
  }
  const cueThreshold = Math.max(1, Math.ceil(items.length * 0.5));
  const visual_cue_types = [...cueFreq.entries()]
    .filter(([, count]) => count >= cueThreshold)
    .sort((a, b) => b[1] - a[1])
    .map(([cue]) => cue);

  return {
    sample_count: items.length,
    hook_formats,
    segment_count_median: median(items.map((i) => i.segment_count)),
    word_count_median: median(items.map((i) => i.word_count)),
    specificity_density_median:
      Math.round(median(items.map((i) => i.specificity_density)) * 100) / 100,
    transition_variety_median: median(items.map((i) => i.transition_variety)),
    visual_cue_types,
  };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}
