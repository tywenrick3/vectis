import { Hono } from "hono";
import { getDb, createLogger } from "@vectis/shared";
import { renderVideo } from "@vectis/video";
import { pickClip, GAMEPLAY_TAGS } from "@vectis/gameplay";

const log = createLogger("route:render");

export const renderRoute = new Hono();

renderRoute.post("/", async (c) => {
  const db = getDb();
  const { pipeline_run_id, script_id, voice_asset_id } = await c.req.json();

  if (!pipeline_run_id || !script_id || !voice_asset_id) {
    return c.json(
      { error: "pipeline_run_id, script_id, and voice_asset_id required" },
      400
    );
  }

  try {
    await db
      .from("pipeline_runs")
      .update({ status: "rendering" })
      .eq("id", pipeline_run_id);

    const [{ data: script }, { data: voiceAsset }] = await Promise.all([
      db.from("scripts").select().eq("id", script_id).single(),
      db.from("voice_assets").select().eq("id", voice_asset_id).single(),
    ]);

    if (!script) throw new Error("Script not found");
    if (!voiceAsset) throw new Error("Voice asset not found");

    // Determine niche from topic
    const { data: topic } = await db
      .from("topics")
      .select("niche")
      .eq("id", script.topic_id)
      .single();

    const niche = topic?.niche ?? "tech-explainer";

    // Pick a gameplay background clip (optional — null if pool is empty for this tag).
    const randomTag =
      GAMEPLAY_TAGS[Math.floor(Math.random() * GAMEPLAY_TAGS.length)];
    const durationSec = Math.ceil((voiceAsset.duration_ms ?? 0) / 1000);
    const backgroundClip =
      randomTag && durationSec > 0
        ? await pickClip({ tag: randomTag, durationSec })
        : null;

    if (backgroundClip) {
      log.info(
        {
          tag: backgroundClip.tag,
          clipId: backgroundClip.clipId,
          startSec: backgroundClip.startSec,
        },
        "using gameplay background",
      );
    } else {
      log.info({ tag: randomTag, durationSec }, "no gameplay background available");
    }

    const video = await renderVideo(script, voiceAsset, niche, {
      backgroundClip: backgroundClip
        ? {
            url: backgroundClip.r2Url,
            startSec: backgroundClip.startSec,
            durationSec: backgroundClip.durationSec,
          }
        : null,
    });

    await db
      .from("pipeline_runs")
      .update({ video_id: video.id, status: "pending" })
      .eq("id", pipeline_run_id);

    log.info({ videoId: video.id }, "Render complete");

    return c.json({
      pipeline_run_id,
      video_id: video.id,
      video_url: video.video_url,
      duration_ms: video.duration_ms,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await db
      .from("pipeline_runs")
      .update({ status: "failed", error_message: message })
      .eq("id", pipeline_run_id);
    log.error({ error: message }, "Render failed");
    return c.json({ error: message }, 500);
  }
});
