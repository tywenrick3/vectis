import { getDb, createLogger, type AnalyticsSnapshot } from "@vectis/shared";

const log = createLogger("analytics:youtube-ingest");

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

export async function ingestYouTubeMetrics(
  accessToken: string
): Promise<AnalyticsSnapshot[]> {
  const db = getDb();

  // Get recent pipeline runs that have a YouTube publish ID
  const { data: runs, error: runsError } = await db
    .from("pipeline_runs")
    .select("id, youtube_publish_id")
    .not("youtube_publish_id", "is", null)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(50);

  if (runsError)
    throw new Error(`Failed to fetch runs: ${runsError.message}`);
  if (!runs?.length) {
    log.info("No YouTube-published runs to ingest");
    return [];
  }

  // Skip runs that already have a recent snapshot (within 12 hours)
  const cutoff = new Date(Date.now() - TWELVE_HOURS_MS).toISOString();
  const runIds = runs.map((r) => r.id);

  const { data: recentSnapshots } = await db
    .from("analytics_snapshots")
    .select("pipeline_run_id")
    .in("pipeline_run_id", runIds)
    .gte("fetched_at", cutoff);

  const recentlyIngested = new Set(
    (recentSnapshots ?? []).map((s) => s.pipeline_run_id)
  );

  const runsToIngest = runs.filter((r) => !recentlyIngested.has(r.id));

  if (runsToIngest.length === 0) {
    log.info("All YouTube runs already have recent snapshots");
    return [];
  }

  // Batch YouTube API call (up to 50 IDs per request)
  const videoIds = runsToIngest.map((r) => r.youtube_publish_id as string);
  const idToRunId = new Map(
    runsToIngest.map((r) => [r.youtube_publish_id as string, r.id])
  );

  const snapshots: AnalyticsSnapshot[] = [];

  try {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoIds.join(",")}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      log.warn(
        { status: response.status },
        "YouTube API request failed"
      );
      return [];
    }

    const data = await response.json();
    const items = data.items ?? [];

    for (const item of items) {
      const runId = idToRunId.get(item.id);
      if (!runId) continue;

      const stats = item.statistics ?? {};

      const { data: snapshot, error } = await db
        .from("analytics_snapshots")
        .insert({
          pipeline_run_id: runId,
          views: parseInt(stats.viewCount ?? "0", 10),
          likes: parseInt(stats.likeCount ?? "0", 10),
          comments: parseInt(stats.commentCount ?? "0", 10),
          shares: 0,
          avg_watch_time_ms: 0,
        })
        .select()
        .single();

      if (!error && snapshot) snapshots.push(snapshot as AnalyticsSnapshot);
    }
  } catch (err) {
    log.warn({ error: err }, "Failed to fetch YouTube metrics");
  }

  log.info({ count: snapshots.length }, "YouTube metrics ingested");
  return snapshots;
}
