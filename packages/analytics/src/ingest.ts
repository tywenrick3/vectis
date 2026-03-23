import { getDb, createLogger, type AnalyticsSnapshot } from "@vectis/shared";

const log = createLogger("analytics:ingest");

export async function ingestMetrics(): Promise<AnalyticsSnapshot[]> {
  const db = getDb();

  // Get recent pipeline runs that have a TikTok publish ID
  const { data: runs, error: runsError } = await db
    .from("pipeline_runs")
    .select("id, tiktok_publish_id")
    .not("tiktok_publish_id", "is", null)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(50);

  if (runsError) throw new Error(`Failed to fetch runs: ${runsError.message}`);
  if (!runs?.length) {
    log.info("No published runs to ingest");
    return [];
  }

  // Get TikTok credentials
  const { data: creds } = await db
    .from("tiktok_credentials")
    .select()
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  if (!creds) throw new Error("No TikTok credentials found");

  const snapshots: AnalyticsSnapshot[] = [];

  for (const run of runs) {
    try {
      const response = await fetch(
        "https://open.tiktokapis.com/v2/video/query/",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${creds.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filters: { video_ids: [run.tiktok_publish_id] },
            fields: [
              "view_count",
              "like_count",
              "comment_count",
              "share_count",
              "avg_watch_time",
            ],
          }),
        }
      );

      if (!response.ok) continue;

      const data = await response.json();
      const video = data.data?.videos?.[0];
      if (!video) continue;

      const { data: snapshot, error } = await db
        .from("analytics_snapshots")
        .insert({
          pipeline_run_id: run.id,
          views: video.view_count ?? 0,
          likes: video.like_count ?? 0,
          comments: video.comment_count ?? 0,
          shares: video.share_count ?? 0,
          avg_watch_time_ms: (video.avg_watch_time ?? 0) * 1000,
        })
        .select()
        .single();

      if (!error && snapshot) snapshots.push(snapshot as AnalyticsSnapshot);
    } catch (err) {
      log.warn({ runId: run.id, error: err }, "Failed to ingest metrics for run");
    }
  }

  log.info({ count: snapshots.length }, "Metrics ingested");
  return snapshots;
}
