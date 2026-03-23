import { Hono } from "hono";
import { getDb, createLogger } from "@vectis/shared";
import { publishToTikTok } from "@vectis/publisher";

const log = createLogger("route:publish");

export const publishRoute = new Hono();

publishRoute.post("/", async (c) => {
  const db = getDb();
  const { pipeline_run_id, video_id, script_id } = await c.req.json();

  if (!pipeline_run_id || !video_id || !script_id) {
    return c.json(
      { error: "pipeline_run_id, video_id, and script_id required" },
      400
    );
  }

  try {
    await db
      .from("pipeline_runs")
      .update({ status: "publishing" })
      .eq("id", pipeline_run_id);

    const [{ data: video }, { data: script }] = await Promise.all([
      db.from("videos").select().eq("id", video_id).single(),
      db.from("scripts").select().eq("id", script_id).single(),
    ]);

    if (!video) throw new Error("Video not found");
    if (!script) throw new Error("Script not found");

    const publishId = await publishToTikTok(video, script);

    await db
      .from("pipeline_runs")
      .update({
        tiktok_publish_id: publishId,
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", pipeline_run_id);

    log.info({ publishId }, "Published to TikTok");

    return c.json({
      pipeline_run_id,
      tiktok_publish_id: publishId,
      status: "completed",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await db
      .from("pipeline_runs")
      .update({ status: "failed", error_message: message })
      .eq("id", pipeline_run_id);
    log.error({ error: message }, "Publish failed");
    return c.json({ error: message }, 500);
  }
});
