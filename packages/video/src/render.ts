import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "node:fs";
import path from "node:path";
import { createLogger, getDb, getEnv, type Script, type VoiceAsset, type VideoAsset, type TranscriptionWord } from "@vectis/shared";
import { selectMusicTrack } from "./music-selector";

const log = createLogger("video:render");

const COMPOSITIONS: Record<string, string> = {
  "tech-explainer": "TechExplainer",
  "finance-education": "FinanceEducation",
};

export interface RenderToFileOptions {
  captionWords?: TranscriptionWord[];
  hookOverride?: string;
  outputPath?: string;
  // Pass `null` to explicitly disable music. Omit to auto-select by niche.
  musicTrack?: string | null;
}

export async function renderToFile(
  script: Script,
  voiceAsset: VoiceAsset,
  niche: string,
  opts?: RenderToFileOptions
): Promise<{ outputPath: string; compositionId: string; musicTrack: string | null }> {
  const compositionId = COMPOSITIONS[niche] ?? "TechExplainer";
  const outputPath = opts?.outputPath ?? `/tmp/vectis-${script.id}.mp4`;

  const musicTrack =
    opts?.musicTrack === undefined
      ? selectMusicTrack(script.id, niche)
      : opts.musicTrack;

  log.info({ scriptId: script.id, compositionId, musicTrack }, "Starting render");

  const entryPoint = path.resolve(import.meta.dirname, "compositions/index.ts");
  const publicDir = path.resolve(import.meta.dirname, "..", "public");

  const bundleLocation = await bundle({
    entryPoint,
    publicDir,
  });

  const inputProps = {
    script,
    voiceAsset,
    captionWords: opts?.captionWords,
    hookOverride: opts?.hookOverride,
    musicTrack,
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
  return { outputPath, compositionId, musicTrack };
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
