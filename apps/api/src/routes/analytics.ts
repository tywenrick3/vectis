import { Hono } from "hono";
import { createLogger } from "@vectis/shared";
import { ingestMetrics, ingestYouTubeMetrics, scoreTopics } from "@vectis/analytics";
import { refreshYouTubeToken } from "@vectis/publisher";

const log = createLogger("route:analytics");

export const analyticsRoute = new Hono();

analyticsRoute.post("/ingest", async (c) => {
  try {
    const tiktokSnapshots = await ingestMetrics();

    let ytSnapshots: Awaited<ReturnType<typeof ingestYouTubeMetrics>> = [];
    try {
      const ytCreds = await refreshYouTubeToken();
      ytSnapshots = await ingestYouTubeMetrics(ytCreds.access_token);
    } catch (err) {
      log.warn({ error: err }, "YouTube ingestion skipped");
    }

    const allSnapshots = [...tiktokSnapshots, ...ytSnapshots];
    const scored = await scoreTopics();

    log.info(
      { tiktok: tiktokSnapshots.length, youtube: ytSnapshots.length, scored },
      "Analytics ingested"
    );

    return c.json({
      snapshots_created: allSnapshots.length,
      tiktok_snapshots: tiktokSnapshots.length,
      youtube_snapshots: ytSnapshots.length,
      topics_scored: scored,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ error: message }, "Analytics ingestion failed");
    return c.json({ error: message }, 500);
  }
});
