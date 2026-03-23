import { getDb, createLogger } from "@vectis/shared";

const log = createLogger("analytics:scoring");

// Weights: views 30%, likes 20%, comments 25%, shares 25%
const WEIGHTS = { views: 0.3, likes: 0.2, comments: 0.25, shares: 0.25 };

export async function scoreTopics(): Promise<number> {
  const db = getDb();

  // Get latest analytics per pipeline run (last 30 days)
  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: snapshots, error } = await db
    .from("analytics_snapshots")
    .select("pipeline_run_id, views, likes, comments, shares")
    .gte("fetched_at", thirtyDaysAgo)
    .order("fetched_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch snapshots: ${error.message}`);
  if (!snapshots?.length) return 0;

  // Deduplicate: keep latest per pipeline_run_id
  const latestByRun = new Map<string, (typeof snapshots)[0]>();
  for (const s of snapshots) {
    if (!latestByRun.has(s.pipeline_run_id)) {
      latestByRun.set(s.pipeline_run_id, s);
    }
  }

  // Compute max values for normalization
  const values = Array.from(latestByRun.values());
  const maxViews = Math.max(1, ...values.map((v) => v.views));
  const maxLikes = Math.max(1, ...values.map((v) => v.likes));
  const maxComments = Math.max(1, ...values.map((v) => v.comments));
  const maxShares = Math.max(1, ...values.map((v) => v.shares));

  // Get topic_id for each pipeline_run
  const runIds = Array.from(latestByRun.keys());
  const { data: runs } = await db
    .from("pipeline_runs")
    .select("id, topic_id")
    .in("id", runIds);

  if (!runs) return 0;

  // Aggregate scores per topic
  const topicScores = new Map<string, number[]>();
  for (const run of runs) {
    if (!run.topic_id) continue;
    const snap = latestByRun.get(run.id);
    if (!snap) continue;

    const score =
      (snap.views / maxViews) * WEIGHTS.views +
      (snap.likes / maxLikes) * WEIGHTS.likes +
      (snap.comments / maxComments) * WEIGHTS.comments +
      (snap.shares / maxShares) * WEIGHTS.shares;

    const existing = topicScores.get(run.topic_id) ?? [];
    existing.push(score);
    topicScores.set(run.topic_id, existing);
  }

  // Update topic scores
  let updated = 0;
  for (const [topicId, scores] of topicScores) {
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const { error: updateError } = await db
      .from("topics")
      .update({ score: Math.round(avgScore * 100) })
      .eq("id", topicId);

    if (!updateError) updated++;
  }

  log.info({ updated }, "Topic scores updated");
  return updated;
}
