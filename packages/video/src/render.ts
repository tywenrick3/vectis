import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "node:fs";
import path from "node:path";
import { createLogger, getDb, getEnv, type Script, type VoiceAsset, type VideoAsset, type TranscriptionWord } from "@vectis/shared";

const log = createLogger("video:render");

const COMPOSITIONS: Record<string, string> = {
  "tech-explainer": "TechExplainer",
  "finance-education": "FinanceEducation",
};

export interface RenderToFileOptions {
  captionWords?: TranscriptionWord[];
  hookOverride?: string;
  outputPath?: string;
}

export async function renderToFile(
  script: Script,
  voiceAsset: VoiceAsset,
  niche: string,
  opts?: RenderToFileOptions
): Promise<{ outputPath: string; compositionId: string }> {
  const compositionId = COMPOSITIONS[niche] ?? "TechExplainer";
  const outputPath = opts?.outputPath ?? `/tmp/vectis-${script.id}.mp4`;

  log.info({ scriptId: script.id, compositionId }, "Starting render");

  const entryPoint = path.resolve(import.meta.dirname, "compositions/index.ts");

  const bundleLocation = await bundle({
    entryPoint,
  });

  const inputProps = {
    script,
    voiceAsset,
    captionWords: opts?.captionWords,
    hookOverride: opts?.hookOverride,
  };

  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: compositionId,
    inputProps,
  });

  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: "h264",
    outputLocation: outputPath,
    inputProps,
  });

  log.info({ outputPath, compositionId }, "Render to file complete");
  return { outputPath, compositionId };
}

export async function renderVideo(
  script: Script,
  voiceAsset: VoiceAsset,
  niche: string
): Promise<VideoAsset> {
  const db = getDb();
  const env = getEnv();

  const { outputPath, compositionId } = await renderToFile(script, voiceAsset, niche);

  // Upload to R2
  const videoBuffer = fs.readFileSync(outputPath);
  const videoKey = `videos/${script.id}.mp4`;

  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });

  await s3.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: videoKey,
      Body: videoBuffer,
      ContentType: "video/mp4",
    })
  );

  const videoUrl = `${env.R2_PUBLIC_URL}/${videoKey}`;

  fs.unlinkSync(outputPath);

  const { data, error } = await db
    .from("videos")
    .insert({
      script_id: script.id,
      voice_asset_id: voiceAsset.id,
      video_url: videoUrl,
      duration_ms: voiceAsset.duration_ms,
      file_size: videoBuffer.length,
      composition_id: compositionId,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to insert video: ${error.message}`);

  log.info({ videoId: data.id }, "Render complete");
  return data as VideoAsset;
}
