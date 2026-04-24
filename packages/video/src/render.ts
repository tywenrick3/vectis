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

export interface BackgroundClipInput {
  url: string;
  startSec: number;
  durationSec: number;
}

export interface RenderToFileOptions {
  captionWords?: TranscriptionWord[];
  hookOverride?: string;
  outputPath?: string;
  backgroundClip?: BackgroundClipInput | null;
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
  const publicDir = path.resolve(import.meta.dirname, "..", "public");

  const bundleLocation = await bundle({
    entryPoint,
    publicDir,
  });

  // Pre-download the background clip into the bundle's static dir so
  // OffthreadVideo can read it via the bundle's local server (relative path)
  // instead of proxying thousands of per-frame requests to R2 — which trips
  // the 28s delayRender timeout on longer videos.
  let bgBundlePath: string | null = null;
  let bgRelativeUrl: string | null = null;
  if (opts?.backgroundClip?.url) {
    const bgDir = path.join(bundleLocation, "bg");
    await fs.promises.mkdir(bgDir, { recursive: true });
    bgBundlePath = path.join(bgDir, `${script.id}.mp4`);
    await downloadToFile(opts.backgroundClip.url, bgBundlePath);
    bgRelativeUrl = `bg/${script.id}.mp4`;
    log.info({ bgBundlePath }, "background clip cached in bundle");
  }

  const inputProps = {
    script,
    voiceAsset,
    captionWords: opts?.captionWords,
    hookOverride: opts?.hookOverride,
    backgroundClip:
      opts?.backgroundClip && bgRelativeUrl
        ? { ...opts.backgroundClip, url: bgRelativeUrl }
        : null,
  };

  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: compositionId,
    inputProps,
  });

  try {
    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: "h264",
      outputLocation: outputPath,
      inputProps,
    });
  } finally {
    if (bgBundlePath) {
      fs.promises.unlink(bgBundlePath).catch(() => {});
    }
  }

  log.info({ outputPath, compositionId }, "Render to file complete");
  return { outputPath, compositionId };
}

async function downloadToFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`download failed: ${res.status} ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(dest, buf);
}

export async function renderVideo(
  script: Script,
  voiceAsset: VoiceAsset,
  niche: string,
  opts?: RenderToFileOptions
): Promise<VideoAsset> {
  const db = getDb();
  const env = getEnv();

  const { outputPath, compositionId } = await renderToFile(script, voiceAsset, niche, opts);

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
