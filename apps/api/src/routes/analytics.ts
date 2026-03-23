import { Hono } from "hono";
import { createLogger } from "@vectis/shared";
import { ingestMetrics, scoreTopics } from "@vectis/analytics";

const log = createLogger("route:analytics");

export const analyticsRoute = new Hono();

analyticsRoute.post("/ingest", async (c) => {
  try {
    const snapshots = await ingestMetrics();
    const scored = await scoreTopics();

    log.info({ snapshots: snapshots.length, scored }, "Analytics ingested");

    return c.json({
      snapshots_created: snapshots.length,
      topics_scored: scored,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ error: message }, "Analytics ingestion failed");
    return c.json({ error: message }, 500);
  }
});
