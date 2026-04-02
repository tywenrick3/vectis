import { Hono } from "hono";
import { getDb, createLogger, deleteFromR2Batch, r2KeyFromUrl } from "@vectis/shared";
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
  const { niche, run_id } = await c.req.json().catch(() => ({ niche: "tech-explainer", run_id: null }));
  const db = getDb();

  try {
    const brief = await buildResearchBrief(niche);

    await logStage(db, run_id, "research", "completed", { niche }, { briefId: brief.id });

    log.info({ briefId: brief.id, niche }, "Research complete");
    return c.json({ research_brief_id: brief.id, niche });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logStage(db, run_id, "research", "failed", { niche }, null, message);
    log.error({ error: message }, "Research failed");
    return c.json({ error: message }, 500);
  }
});

// Trigger ideation with research brief
pipelineRoute.post("/ideate", async (c) => {
  const { research_brief_id, run_id } = await c.req.json();
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

    await logStage(db, run_id, "ideation", "completed", { research_brief_id }, { topicId: topic.id, scriptId: script.id });

    log.info({ topicId: topic.id, scriptId: script.id }, "Ideation complete");
    return c.json({
      topic_id: topic.id,
      script_id: script.id,
      title: topic.title,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logStage(db, run_id, "ideation", "failed", { research_brief_id }, null, message);
    log.error({ error: message }, "Ideation failed");
    return c.json({ error: message }, 500);
  }
});

// Trigger voice synthesis
pipelineRoute.post("/generate-voice", async (c) => {
  const { script_id, run_id } = await c.req.json();
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

    await logStage(db, run_id, "voice", "completed", { script_id }, { voiceAssetId: voiceAsset.id, duration_ms: voiceAsset.duration_ms });

    log.info({ voiceAssetId: voiceAsset.id }, "Voice generated");
    return c.json({
      voice_asset_id: voiceAsset.id,
      audio_url: voiceAsset.audio_url,
      duration_ms: voiceAsset.duration_ms,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logStage(db, run_id, "voice", "failed", { script_id }, null, message);
    log.error({ error: message }, "Voice generation failed");
    return c.json({ error: message }, 500);
  }
});

// Trigger video render
pipelineRoute.post("/render-video", async (c) => {
  const { script_id, voice_asset_id, run_id } = await c.req.json();
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

    await logStage(db, run_id, "render", "completed", { script_id, voice_asset_id }, { videoId: video.id, duration_ms: video.duration_ms });

    log.info({ videoId: video.id }, "Video rendered");
    return c.json({
      video_id: video.id,
      video_url: video.video_url,
      duration_ms: video.duration_ms,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logStage(db, run_id, "render", "failed", { script_id, voice_asset_id }, null, message);
    log.error({ error: message }, "Render failed");
    return c.json({ error: message }, 500);
  }
});

// Trigger assembly (captions, multi-format, hook variants)
pipelineRoute.post("/assemble", async (c) => {
  const { script_id, video_id, voice_asset_id, formats, include_hook_variants, run_id } =
    await c.req.json();
  const db = getDb();

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

    await logStage(db, run_id, "assembly", "completed", { script_id, video_id, voice_asset_id }, { jobIds, jobCount: jobs.length });

    log.info({ jobCount: jobs.length, jobIds }, "Assembly complete");
    return c.json({
      assembly_job_ids: jobIds,
      primary_output_url: primaryOutput?.output_url ?? null,
      jobs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logStage(db, run_id, "assembly", "failed", { script_id, video_id, voice_asset_id }, null, message);
    log.error({ error: message }, "Assembly failed");
    return c.json({ error: message }, 500);
  }
});

// Publish to platform
pipelineRoute.post("/publish", async (c) => {
  const { video_id, script_id, platform, run_id } = await c.req.json();
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

    await logStage(db, run_id, "publish", "completed", { video_id, script_id, platform: targetPlatform }, { publishId });

    log.info({ publishId, platform: targetPlatform }, "Published");
    return c.json({ publish_id: publishId, platform: targetPlatform });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logStage(db, run_id, "publish", "failed", { video_id, script_id, platform: platform ?? "youtube" }, null, message);
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
  const { run_id } = await c.req.json().catch(() => ({ run_id: null }));
  const db = getDb();

  try {
    const snapshots = await ingestMetrics();
    const scored = await scoreTopics();

    await logStage(db, run_id, "analytics", "completed", {}, { snapshots_created: snapshots.length, topics_scored: scored });

    return c.json({ snapshots_created: snapshots.length, topics_scored: scored });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logStage(db, run_id, "analytics", "failed", {}, null, message);
    return c.json({ error: message }, 500);
  }
});

// Delete R2 files for a single published pipeline run
pipelineRoute.delete("/:runId/files", async (c) => {
  const runId = c.req.param("runId");
  const db = getDb();

  try {
    const { data: run } = await db
      .from("pipeline_runs")
      .select()
      .eq("id", runId)
      .single();

    if (!run) return c.json({ error: "Run not found" }, 404);

    if (run.status !== "completed" || !run.youtube_publish_id) {
      return c.json(
        { error: "Run must be completed and published to YouTube before files can be deleted" },
        409
      );
    }

    const keys = await collectR2Keys(db, run);
    if (keys.length === 0) {
      return c.json({ run_id: runId, deleted: 0, keys: [] });
    }

    const { deleted } = await deleteFromR2Batch(keys);
    await nullifyUrls(db, run);

    log.info({ runId, deleted, keys }, "R2 files deleted for run");
    return c.json({ run_id: runId, deleted, keys });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ error: message, runId }, "Failed to delete files");
    return c.json({ error: message }, 500);
  }
});

// Bulk-delete R2 files for all published pipeline runs
pipelineRoute.delete("/published/files", async (c) => {
  const dryRun = c.req.query("dry_run") === "true";
  const db = getDb();

  try {
    const { data: runs, error } = await db
      .from("pipeline_runs")
      .select()
      .eq("status", "completed")
      .not("youtube_publish_id", "is", null);

    if (error) throw new Error(error.message);
    if (!runs || runs.length === 0) {
      return c.json({ runs_cleaned: 0, files_deleted: 0, run_ids: [] });
    }

    const allKeys: string[] = [];
    const cleanedRuns: typeof runs = [];

    for (const run of runs) {
      const keys = await collectR2Keys(db, run);
      if (keys.length > 0) {
        allKeys.push(...keys);
        cleanedRuns.push(run);
      }
    }

    if (allKeys.length === 0) {
      return c.json({ runs_cleaned: 0, files_deleted: 0, run_ids: [] });
    }

    if (dryRun) {
      return c.json({
        dry_run: true,
        runs_to_clean: cleanedRuns.length,
        files_to_delete: allKeys.length,
        run_ids: cleanedRuns.map((r) => r.id),
        keys: allKeys,
      });
    }

    const { deleted } = await deleteFromR2Batch(allKeys);
    for (const run of cleanedRuns) {
      await nullifyUrls(db, run);
    }

    log.info(
      { runsCleaned: cleanedRuns.length, filesDeleted: deleted },
      "Bulk R2 cleanup complete"
    );
    return c.json({
      runs_cleaned: cleanedRuns.length,
      files_deleted: deleted,
      run_ids: cleanedRuns.map((r) => r.id),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ error: message }, "Bulk cleanup failed");
    return c.json({ error: message }, 500);
  }
});

// Collect R2 keys for all assets tied to a pipeline run
async function collectR2Keys(
  db: ReturnType<typeof getDb>,
  run: { voice_asset_id: string | null; video_id: string | null; assembly_job_ids: string[] | null }
): Promise<string[]> {
  const keys: string[] = [];

  if (run.voice_asset_id) {
    const { data } = await db
      .from("voice_assets")
      .select("audio_url")
      .eq("id", run.voice_asset_id)
      .single();
    if (data?.audio_url) keys.push(r2KeyFromUrl(data.audio_url));
  }

  if (run.video_id) {
    const { data } = await db
      .from("videos")
      .select("video_url")
      .eq("id", run.video_id)
      .single();
    if (data?.video_url) keys.push(r2KeyFromUrl(data.video_url));
  }

  if (run.assembly_job_ids && run.assembly_job_ids.length > 0) {
    const { data: outputs } = await db
      .from("assembly_outputs")
      .select("output_url")
      .in("assembly_job_id", run.assembly_job_ids);
    if (outputs) {
      for (const o of outputs) {
        if (o.output_url) keys.push(r2KeyFromUrl(o.output_url));
      }
    }
  }

  return keys;
}

// Null out media URLs in DB after R2 deletion
async function nullifyUrls(
  db: ReturnType<typeof getDb>,
  run: { voice_asset_id: string | null; video_id: string | null; assembly_job_ids: string[] | null }
): Promise<void> {
  if (run.voice_asset_id) {
    await db.from("voice_assets").update({ audio_url: null }).eq("id", run.voice_asset_id);
  }
  if (run.video_id) {
    await db.from("videos").update({ video_url: null }).eq("id", run.video_id);
  }
  if (run.assembly_job_ids && run.assembly_job_ids.length > 0) {
    await db.from("assembly_outputs").update({ output_url: null }).in("assembly_job_id", run.assembly_job_ids);
  }
}

// Helper: log a pipeline stage
async function logStage(
  db: ReturnType<typeof getDb>,
  runId: string | null,
  stage: string,
  status: "started" | "completed" | "failed",
  input: unknown,
  output: unknown,
  error?: string
) {
  if (!runId) return;
  await db.from("pipeline_stage_logs").insert({
    run_id: runId,
    stage,
    status,
    input,
    output,
    error: error ?? null,
    started_at: new Date().toISOString(),
    completed_at: status !== "started" ? new Date().toISOString() : null,
  });
}
