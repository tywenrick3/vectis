import { getDb, createLogger, type AnalyticsSnapshot } from "@vectis/shared";
import { fetchYouTubeRetention, type VideoRetention } from "./youtube-retention.js";

const log = createLogger("analytics:youtube-ingest");

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

export async function ingestYouTubeMetrics(
  accessToken: string
): Promise<AnalyticsSnapshot[]> {
  const db = getDb();

  // Get recent pipeline runs that have a YouTube publish ID
  const { data: runs, error: runsError } = await db
    .from("pipeline_runs")
    .select("id, youtube_publish_id, voice_asset_id, completed_at")
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

  // Batch-fetch voice durations for completion_rate calculation
  const voiceAssetIds = runsToIngest
    .map((r) => r.voice_asset_id)
    .filter((id): id is string => !!id);

  const durationByRun = new Map<string, number>();
  if (voiceAssetIds.length > 0) {
    const { data: voiceAssets } = await db
      .from("voice_assets")
      .select("id, duration_ms")
      .in("id", voiceAssetIds);

    const durationByVoice = new Map(
      (voiceAssets ?? []).map((v) => [v.id, v.duration_ms as number])
    );
    for (const run of runsToIngest) {
      if (run.voice_asset_id) {
        const d = durationByVoice.get(run.voice_asset_id);
        if (d) durationByRun.set(run.id, d);
      }
    }
  }

  // Batch YouTube Data API call (up to 50 IDs per request)
  const videoIds = runsToIngest.map((r) => r.youtube_publish_id as string);
  const idToRunId = new Map(
    runsToIngest.map((r) => [r.youtube_publish_id as string, r.id])
  );

  // Fetch retention in parallel with stats — requires yt-analytics.readonly scope.
  // If it fails, we still persist stats; completion_rate will be null.
  const startDate = computeRetentionStartDate(runsToIngest);
  const retentionPromise = fetchYouTubeRetention(
    accessToken,
    videoIds,
    startDate
  ).catch((err) => {
    log.warn({ error: err }, "YT retention fetch failed — proceeding without it");
    return new Map<string, VideoRetention>();
  });

  const snapshots: AnalyticsSnapshot[] = [];

  try {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoIds.join(",")}`;
    const [response, retentionByVideo] = await Promise.all([
      fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } }),
      retentionPromise,
    ]);

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
      const retention = retentionByVideo.get(item.id);
      const scriptDurationMs = durationByRun.get(runId) ?? null;

      // YT reports averageViewPercentage as a fraction already (0-1 after normalization).
      // It IS the completion rate — prefer it over a computed ratio.
      const completionRate = retention?.avg_view_percentage ?? null;
      const avgWatchMs = retention
        ? Math.round(retention.avg_view_duration_sec * 1000)
        : 0;

      const { data: snapshot, error } = await db
        .from("analytics_snapshots")
        .insert({
          pipeline_run_id: runId,
          platform: "youtube",
          views: parseInt(stats.viewCount ?? "0", 10),
          likes: parseInt(stats.likeCount ?? "0", 10),
          comments: parseInt(stats.commentCount ?? "0", 10),
          shares: 0,
          avg_watch_time_ms: avgWatchMs,
          script_duration_ms: scriptDurationMs,
          completion_rate: completionRate,
          avg_view_percentage: completionRate,
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

function computeRetentionStartDate(
  runs: { completed_at: string | null }[]
): string {
  const timestamps = runs
    .map((r) => (r.completed_at ? new Date(r.completed_at).getTime() : 0))
    .filter((t) => t > 0);

  // Earliest completed_at minus 1 day buffer, or 60 days ago as fallback
  const earliest = timestamps.length > 0 ? Math.min(...timestamps) : Date.now() - SIXTY_DAYS_MS;
  const startMs = earliest - 24 * 60 * 60 * 1000;
  return new Date(startMs).toISOString().slice(0, 10);
}
