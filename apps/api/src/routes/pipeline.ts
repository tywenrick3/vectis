import { Hono } from "hono";
import { getDb, createLogger } from "@vectis/shared";
import { buildResearchBrief } from "@vectis/research";
import { runIdeationAgent } from "@vectis/ideation";
import { synthesize } from "@vectis/voice";
import { renderVideo } from "@vectis/video";
import { assemble } from "@vectis/assembly";
import { publishToTikTok, publishToYouTube } from "@vectis/publisher";
import { ingestMetrics, scoreTopics } from "@vectis/analytics";

const log = createLogger("route:pipeline");

export const pipelineRoute = new Hono();

// Trigger research
pipelineRoute.post("/research", async (c) => {
  const { niche } = await c.req.json().catch(() => ({ niche: "tech-explainer" }));
  const db = getDb();

  try {
    const brief = await buildResearchBrief(niche);

    await logStage(db, null, "research", brief, { briefId: brief.id });

    log.info({ briefId: brief.id, niche }, "Research complete");
    return c.json({ research_brief_id: brief.id, niche });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ error: message }, "Research failed");
    return c.json({ error: message }, 500);
  }
});

// Trigger ideation with research brief
pipelineRoute.post("/ideate", async (c) => {
  const { research_brief_id } = await c.req.json();
  const db = getDb();

  if (!research_brief_id) {
    return c.json({ error: "research_brief_id required" }, 400);
  }

  try {
    const { data: brief, error } = await db
      .from("research_briefs")
      .select()
      .eq("id", research_brief_id)
      .single();

    if (error || !brief) throw new Error("Research brief not found");

    const { topic, script } = await runIdeationAgent(brief);

    log.info({ topicId: topic.id, scriptId: script.id }, "Ideation complete");
    return c.json({
      topic_id: topic.id,
      script_id: script.id,
      title: topic.title,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ error: message }, "Ideation failed");
    return c.json({ error: message }, 500);
  }
});

// Trigger voice synthesis
pipelineRoute.post("/generate-voice", async (c) => {
  const { script_id } = await c.req.json();
  const db = getDb();

  if (!script_id) return c.json({ error: "script_id required" }, 400);

  try {
    const { data: script, error } = await db
      .from("scripts")
      .select()
      .eq("id", script_id)
      .single();

    if (error || !script) throw new Error("Script not found");

    const voiceAsset = await synthesize(script);

    log.info({ voiceAssetId: voiceAsset.id }, "Voice generated");
    return c.json({
      voice_asset_id: voiceAsset.id,
      audio_url: voiceAsset.audio_url,
      duration_ms: voiceAsset.duration_ms,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ error: message }, "Voice generation failed");
    return c.json({ error: message }, 500);
  }
});

// Trigger video render
pipelineRoute.post("/render-video", async (c) => {
  const { script_id, voice_asset_id } = await c.req.json();
  const db = getDb();

  if (!script_id || !voice_asset_id) {
    return c.json({ error: "script_id and voice_asset_id required" }, 400);
  }

  try {
    const [{ data: script }, { data: voiceAsset }] = await Promise.all([
      db.from("scripts").select().eq("id", script_id).single(),
      db.from("voice_assets").select().eq("id", voice_asset_id).single(),
    ]);

    if (!script) throw new Error("Script not found");
    if (!voiceAsset) throw new Error("Voice asset not found");

    const { data: topic } = await db
      .from("topics")
      .select("niche")
      .eq("id", script.topic_id)
      .single();

    const niche = topic?.niche ?? "tech-explainer";
    const video = await renderVideo(script, voiceAsset, niche);

    log.info({ videoId: video.id }, "Video rendered");
    return c.json({
      video_id: video.id,
      video_url: video.video_url,
      duration_ms: video.duration_ms,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ error: message }, "Render failed");
    return c.json({ error: message }, 500);
  }
});

// Trigger assembly (captions, multi-format, hook variants)
pipelineRoute.post("/assemble", async (c) => {
  const { script_id, video_id, voice_asset_id, formats, include_hook_variants } =
    await c.req.json();

  if (!script_id || !video_id || !voice_asset_id) {
    return c.json({ error: "script_id, video_id, and voice_asset_id required" }, 400);
  }

  try {
    const jobs = await assemble({
      scriptId: script_id,
      videoId: video_id,
      voiceAssetId: voice_asset_id,
      formats,
      includeHookVariants: include_hook_variants,
    });

    const jobIds = jobs.map((j) => j.id);
    const primaryOutput = jobs[0]?.outputs?.find((o) => o.format === "9:16");

    log.info({ jobCount: jobs.length, jobIds }, "Assembly complete");
    return c.json({
      assembly_job_ids: jobIds,
      primary_output_url: primaryOutput?.output_url ?? null,
      jobs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ error: message }, "Assembly failed");
    return c.json({ error: message }, 500);
  }
});

// Publish to platform
pipelineRoute.post("/publish", async (c) => {
  const { video_id, script_id, platform } = await c.req.json();
  const db = getDb();

  if (!video_id || !script_id) {
    return c.json({ error: "video_id and script_id required" }, 400);
  }

  try {
    const [{ data: video }, { data: script }] = await Promise.all([
      db.from("videos").select().eq("id", video_id).single(),
      db.from("scripts").select().eq("id", script_id).single(),
    ]);

    if (!video) throw new Error("Video not found");
    if (!script) throw new Error("Script not found");

    let publishId: string;
    const targetPlatform = platform ?? "youtube";

    if (targetPlatform === "tiktok") {
      publishId = await publishToTikTok(video, script);
    } else {
      publishId = await publishToYouTube(video, script);
    }

    log.info({ publishId, platform: targetPlatform }, "Published");
    return c.json({ publish_id: publishId, platform: targetPlatform });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ error: message }, "Publish failed");
    return c.json({ error: message }, 500);
  }
});

// Record a full pipeline run
pipelineRoute.post("/record-run", async (c) => {
  const body = await c.req.json();
  const db = getDb();

  try {
    const { data, error } = await db
      .from("pipeline_runs")
      .insert({
        niche: body.niche,
        topic_id: body.topic_id,
        script_id: body.script_id,
        voice_asset_id: body.voice_asset_id,
        video_id: body.video_id,
        youtube_publish_id: body.youtube_publish_id ?? null,
        tiktok_publish_id: body.tiktok_publish_id ?? null,
        research_brief_id: body.research_brief_id ?? null,
        status: body.status ?? "completed",
        completed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    log.info({ runId: data.id }, "Pipeline run recorded");
    return c.json({ pipeline_run_id: data.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ error: message }, "Failed to record run");
    return c.json({ error: message }, 500);
  }
});

// Check pipeline run status
pipelineRoute.get("/status/:runId", async (c) => {
  const runId = c.req.param("runId");
  const db = getDb();

  const [{ data: run }, { data: stageLogs }] = await Promise.all([
    db.from("pipeline_runs").select().eq("id", runId).single(),
    db
      .from("pipeline_stage_logs")
      .select()
      .eq("run_id", runId)
      .order("started_at", { ascending: true }),
  ]);

  if (!run) return c.json({ error: "Run not found" }, 404);

  return c.json({ run, stage_logs: stageLogs ?? [] });
});

// Trigger analytics ingest + scoring
pipelineRoute.post("/analytics", async (c) => {
  try {
    const snapshots = await ingestMetrics();
    const scored = await scoreTopics();
    return c.json({ snapshots_created: snapshots.length, topics_scored: scored });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// Helper: log a pipeline stage
async function logStage(
  db: ReturnType<typeof getDb>,
  runId: string | null,
  stage: string,
  input: unknown,
  output: unknown
) {
  if (!runId) return;
  await db.from("pipeline_stage_logs").insert({
    run_id: runId,
    stage,
    status: "completed",
    input,
    output,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });
}
