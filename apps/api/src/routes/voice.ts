import { Hono } from "hono";
import { getDb, createLogger } from "@vectis/shared";
import { synthesize } from "@vectis/voice";

const log = createLogger("route:voice");

export const voiceRoute = new Hono();

voiceRoute.post("/", async (c) => {
  const db = getDb();
  const { pipeline_run_id, script_id } = await c.req.json();

  if (!pipeline_run_id || !script_id) {
    return c.json({ error: "pipeline_run_id and script_id required" }, 400);
  }

  try {
    await db
      .from("pipeline_runs")
      .update({ status: "voicing" })
      .eq("id", pipeline_run_id);

    const { data: script, error } = await db
      .from("scripts")
      .select()
      .eq("id", script_id)
      .single();

    if (error || !script) throw new Error("Script not found");

    const voiceAsset = await synthesize(script);

    await db
      .from("pipeline_runs")
      .update({ voice_asset_id: voiceAsset.id, status: "pending" })
      .eq("id", pipeline_run_id);

    log.info({ voiceAssetId: voiceAsset.id }, "Voice synthesis complete");

    return c.json({
      pipeline_run_id,
      voice_asset_id: voiceAsset.id,
      audio_url: voiceAsset.audio_url,
      duration_ms: voiceAsset.duration_ms,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await db
      .from("pipeline_runs")
      .update({ status: "failed", error_message: message })
      .eq("id", pipeline_run_id);
    log.error({ error: message }, "Voice synthesis failed");
    return c.json({ error: message }, 500);
  }
});
