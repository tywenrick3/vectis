import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "node:fs";
import {
  createLogger,
  getDb,
  getEnv,
  type Script,
  type VoiceAsset,
  type VideoAsset,
  type AssemblyJob,
  type OutputFormat,
} from "@vectis/shared";
import { renderToFile } from "@vectis/video";
import { transcribe } from "./transcribe.js";
import { convertFormat, FORMAT_SPECS } from "./format.js";

const log = createLogger("assembly:assemble");

export interface AssembleOptions {
  scriptId: string;
  videoId: string;
  voiceAssetId: string;
  formats?: OutputFormat[];
  includeHookVariants?: boolean;
}

export async function assemble(options: AssembleOptions): Promise<AssemblyJob[]> {
  const db = getDb();
  const {
    scriptId,
    videoId,
    voiceAssetId,
    formats = ["9:16"],
    includeHookVariants = false,
  } = options;

  // Load entities from DB
  const [{ data: script }, { data: voiceAsset }, { data: video }] = await Promise.all([
    db.from("scripts").select().eq("id", scriptId).single(),
    db.from("voice_assets").select().eq("id", voiceAssetId).single(),
    db.from("videos").select().eq("id", videoId).single(),
  ]);

  if (!script) throw new Error("Script not found");
  if (!voiceAsset) throw new Error("Voice asset not found");
  if (!video) throw new Error("Video not found");

  const typedScript = script as Script;
  const typedVoiceAsset = voiceAsset as VoiceAsset;
  const typedVideo = video as VideoAsset;

  // Get niche for composition selection
  const { data: topic } = await db
    .from("topics")
    .select("niche")
    .eq("id", typedScript.topic_id)
    .single();

  const niche = topic?.niche ?? "tech-explainer";

  // Build list of hooks to render
  const hooks: { index: number; text: string }[] = [
    { index: 0, text: typedScript.hook },
  ];

  if (includeHookVariants && typedScript.hook_variants?.length > 0) {
    typedScript.hook_variants.forEach((variant, i) => {
      hooks.push({ index: i + 1, text: variant });
    });
  }

  const jobs: AssemblyJob[] = [];

  for (const hook of hooks) {
    try {
      const job = await assembleVariant({
        db,
        script: typedScript,
        voiceAsset: typedVoiceAsset,
        video: typedVideo,
        niche,
        hookVariantIndex: hook.index,
        hookText: hook.text,
        formats,
      });
      jobs.push(job);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      log.error({ hookIndex: hook.index, error: message }, "Assembly variant failed");
    }
  }

  return jobs;
}

interface AssembleVariantParams {
  db: ReturnType<typeof getDb>;
  script: Script;
  voiceAsset: VoiceAsset;
  video: VideoAsset;
  niche: string;
  hookVariantIndex: number;
  hookText: string;
  formats: OutputFormat[];
}

async function assembleVariant(params: AssembleVariantParams): Promise<AssemblyJob> {
  const { db, script, voiceAsset, video, niche, hookVariantIndex, hookText, formats } = params;
  const env = getEnv();
  const compositionId = video.composition_id;

  // Step 1: Transcribe first (deduped across variants) — must exist before job insert due to FK
  log.info({ hookVariantIndex }, "Transcribing");
  const transcription = await transcribe(voiceAsset);

  // Create assembly job with real transcription_id
  const { data: job, error: jobError } = await db
    .from("assembly_jobs")
    .insert({
      script_id: script.id,
      video_id: video.id,
      voice_asset_id: voiceAsset.id,
      transcription_id: transcription.id,
      hook_variant_index: hookVariantIndex,
      hook_text: hookText,
      composition_id: compositionId,
      status: "rendering",
    })
    .select()
    .single();

  if (jobError) throw new Error(`Failed to create assembly job: ${jobError.message}`);

  const jobId = job.id;
  const tempFiles: string[] = [];

  try {

    // Step 2: Render with captions + hook override
    log.info({ jobId, hookVariantIndex }, "Rendering with captions");
    const outputPath = `/tmp/vectis-assembled-${jobId}.mp4`;
    const hookOverride = hookVariantIndex > 0 ? hookText : undefined;

    await renderToFile(script, voiceAsset, niche, {
      captionWords: transcription.words,
      hookOverride,
      outputPath,
    });
    tempFiles.push(outputPath);

    // Step 3: Format conversion
    await db
      .from("assembly_jobs")
      .update({ status: "formatting" })
      .eq("id", jobId);

    const formatOutputs: { format: OutputFormat; localPath: string }[] = [
      { format: "9:16", localPath: outputPath },
    ];

    for (const fmt of formats) {
      if (fmt === "9:16") continue; // already have this
      log.info({ jobId, format: fmt }, "Converting format");
      const convertedPath = await convertFormat(outputPath, fmt);
      tempFiles.push(convertedPath);
      formatOutputs.push({ format: fmt, localPath: convertedPath });
    }

    // Step 4: Upload all formats to R2
    const s3 = new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });

    const outputs = [];

    for (const { format, localPath } of formatOutputs) {
      const videoBuffer = fs.readFileSync(localPath);
      const r2Key = `assembled/${jobId}/${format.replace(":", "x")}.mp4`;

      await s3.send(
        new PutObjectCommand({
          Bucket: env.R2_BUCKET_NAME,
          Key: r2Key,
          Body: videoBuffer,
          ContentType: "video/mp4",
        })
      );

      const outputUrl = `${env.R2_PUBLIC_URL}/${r2Key}`;
      const spec = FORMAT_SPECS[format];

      const { data: output, error: outputError } = await db
        .from("assembly_outputs")
        .insert({
          assembly_job_id: jobId,
          format,
          output_url: outputUrl,
          width: spec.width,
          height: spec.height,
          file_size: videoBuffer.length,
        })
        .select()
        .single();

      if (outputError) throw new Error(`Failed to insert assembly output: ${outputError.message}`);
      outputs.push(output);
    }

    // Step 5: Mark complete
    await db
      .from("assembly_jobs")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", jobId);

    log.info({ jobId, outputCount: outputs.length }, "Assembly complete");

    return {
      ...job,
      transcription_id: transcription.id,
      status: "completed",
      completed_at: new Date().toISOString(),
      outputs,
    } as AssemblyJob;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await db
      .from("assembly_jobs")
      .update({ status: "failed", error_message: message })
      .eq("id", jobId);
    throw err;
  } finally {
    // Cleanup temp files
    for (const f of tempFiles) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {
        log.warn({ file: f }, "Failed to cleanup temp file");
      }
    }
  }
}
