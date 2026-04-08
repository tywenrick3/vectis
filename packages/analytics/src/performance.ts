import { getDb, createLogger, type TopicPerformance } from "@vectis/shared";

const log = createLogger("analytics:performance");

export async function getPerformanceContext(niche: string): Promise<{
  recently_covered: { title: string; description: string }[];
  top_performers: TopicPerformance[];
  low_performers: TopicPerformance[];
}> {
  const db = getDb();

  // Fetch recently published topics to avoid repetition
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

  // Fetch all scored topics for this niche
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

  // Enrich with actual metrics from analytics_snapshots
  const topicIds = allScored.map((t) => t.id);

  const { data: runs } = await db
    .from("pipeline_runs")
    .select("id, topic_id")
    .in("topic_id", topicIds)
    .eq("status", "completed");

  if (!runs?.length) {
    const mapToPerf = (t: typeof allScored[0]): TopicPerformance => ({
      title: t.title,
      description: t.description,
      score: t.score,
      views: 0,
      likes: 0,
      comments: 0,
    });
    return {
      recently_covered,
      top_performers: topRaw.map(mapToPerf),
      low_performers: bottomRaw.map(mapToPerf),
    };
  }

  const runIds = runs.map((r) => r.id);

  const { data: snapshots } = await db
    .from("analytics_snapshots")
    .select("pipeline_run_id, views, likes, comments")
    .in("pipeline_run_id", runIds)
    .order("fetched_at", { ascending: false });

  // Latest snapshot per run
  const latestByRun = new Map<
    string,
    { views: number; likes: number; comments: number }
  >();
  for (const s of snapshots ?? []) {
    if (!latestByRun.has(s.pipeline_run_id)) {
      latestByRun.set(s.pipeline_run_id, s);
    }
  }

  // Aggregate metrics per topic (sum across runs)
  const metricsByTopic = new Map<
    string,
    { views: number; likes: number; comments: number }
  >();
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

  const enrich = (t: typeof allScored[0]): TopicPerformance => ({
    title: t.title,
    description: t.description,
    score: t.score,
    ...(metricsByTopic.get(t.id) ?? { views: 0, likes: 0, comments: 0 }),
  });

  log.info(
    { niche, scored: allScored.length, top: topRaw.length, bottom: bottomRaw.length },
    "Performance context built"
  );

  return {
    recently_covered,
    top_performers: topRaw.map(enrich),
    low_performers: bottomRaw.map(enrich),
  };
}
