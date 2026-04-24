import ffmpeg from "fluent-ffmpeg";
import { createLogger } from "@vectis/shared";

const log = createLogger("gameplay:normalize");

const TARGET_WIDTH = 1080;
const TARGET_HEIGHT = 1920;
const TARGET_FPS = 30;
const CRF = 20;
const PRESET = "veryfast";

export interface NormalizeOptions {
  inputPath: string;
  outputPath: string;
  isVertical: boolean;
}

export function normalizeClip(opts: NormalizeOptions): Promise<void> {
  const { inputPath, outputPath, isVertical } = opts;

  // setsar=1 first: forces 1:1 pixel aspect ratio to undo stretched re-uploads
  // (common on subway-surfers compilations where SAR != 1 masks DAR manipulation).
  // Vertical sources: scale fit + pad (preserves aspect, avoids cropping gameplay).
  // Landscape sources: center-crop to 9:16 then scale.
  const videoFilter = isVertical
    ? `setsar=1,scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease,pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black`
    : `setsar=1,crop=ih*9/16:ih,scale=${TARGET_WIDTH}:${TARGET_HEIGHT}`;

  log.info({ inputPath, outputPath, isVertical }, "normalizing");

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noAudio()
      .fps(TARGET_FPS)
      .videoCodec("libx264")
      .outputOptions([
        "-crf",
        String(CRF),
        "-preset",
        PRESET,
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
      ])
      .videoFilter(videoFilter)
      .on("end", () => {
        log.info({ outputPath }, "normalize complete");
        resolve();
      })
      .on("error", (err: Error) => {
        log.error({ err: err.message }, "normalize failed");
        reject(err);
      })
      .save(outputPath);
  });
}
