import { getDb, createLogger, type TopicPerformance } from "@vectis/shared";

const log = createLogger("analytics:performance");

/**
 * Build the performance context handed to the ideation agent: recently
 * covered topics (so the agent doesn't repeat itself), top performers, and
 * low performers. Top/bottom are picked by topics.score (the cross-platform
 * rollup). Per-platform breakdown is attached via topic_platform_scores so
 * the agent can see whether a topic is YT-strong or TT-strong.
 */
export async function getPerformanceContext(niche: string): Promise<{
  recently_covered: { title: string; description: string }[];
  top_performers: TopicPerformance[];
  low_performers: TopicPerformance[];
}> {
  const db = getDb();

  const { data: recentTopics } = await db
    .from("topics")
    .select("title, description")
    .eq("niche", niche)
    .eq("used", true)
    .order("created_at", { ascending: false })
    .limit(20);

  const recently_covered = (recentTopics ?? []).map(
    (t: { title: string; description: string }) => ({
      title: t.title,
      description: t.description,
    })
  );

  const { data: scoredTopics } = await db
    .from("topics")
    .select("id, title, description, score")
    .eq("niche", niche)
    .eq("used", true)
    .gt("score", 0)
    .order("score", { ascending: false });

  const allScored = scoredTopics ?? [];
  if (allScored.length === 0) {
    return { recently_covered, top_performers: [], low_performers: [] };
  }

  const topRaw = allScored.slice(0, 5);
  const bottomRaw = allScored.slice(-5).reverse();
  const topicIds = allScored.map((t) => t.id);

  // Per-platform breakdown
  const { data: platformScores } = await db
    .from("topic_platform_scores")
    .select("topic_id, platform, score")
    .in("topic_id", topicIds);

  const platformMap = new Map<string, Record<string, number>>();
  for (const row of platformScores ?? []) {
    const existing = platformMap.get(row.topic_id) ?? {};
    existing[row.platform] = row.score;
    platformMap.set(row.topic_id, existing);
  }

  // Raw metric rollup (sum across runs) for the top/bottom lists
  const { data: runs } = await db
    .from("pipeline_runs")
    .select("id, topic_id")
    .in("topic_id", topicIds)
    .eq("status", "completed");

  const metricsByTopic = new Map<
    string,
    { views: number; likes: number; comments: number }
  >();

  if (runs?.length) {
    const runIds = runs.map((r) => r.id);
    const { data: snapshots } = await db
      .from("analytics_snapshots")
      .select("pipeline_run_id, views, likes, comments")
      .in("pipeline_run_id", runIds)
      .order("fetched_at", { ascending: false });

    const latestByRun = new Map<
      string,
      { views: number; likes: number; comments: number }
    >();
    for (const s of snapshots ?? []) {
      if (!latestByRun.has(s.pipeline_run_id)) {
        latestByRun.set(s.pipeline_run_id, s);
      }
    }

    for (const run of runs) {
      const snap = latestByRun.get(run.id);
      if (!snap) continue;
      const existing = metricsByTopic.get(run.topic_id) ?? {
        views: 0,
        likes: 0,
        comments: 0,
      };
      existing.views += snap.views;
      existing.likes += snap.likes;
      existing.comments += snap.comments;
      metricsByTopic.set(run.topic_id, existing);
    }
  }

  const enrich = (t: (typeof allScored)[0]): TopicPerformance => ({
    title: t.title,
    description: t.description,
    score: t.score,
    ...(metricsByTopic.get(t.id) ?? { views: 0, likes: 0, comments: 0 }),
    ...(platformMap.has(t.id)
      ? { platform_scores: platformMap.get(t.id) }
      : {}),
  });

  log.info(
    {
      niche,
      scored: allScored.length,
      top: topRaw.length,
      bottom: bottomRaw.length,
      with_platform_breakdown: platformMap.size,
    },
    "Performance context built"
  );

  return {
    recently_covered,
    top_performers: topRaw.map(enrich),
    low_performers: bottomRaw.map(enrich),
  };
}
