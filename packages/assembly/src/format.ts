import ffmpeg from "fluent-ffmpeg";
import path from "node:path";
import { createLogger, type OutputFormat } from "@vectis/shared";

const log = createLogger("assembly:format");

export interface FormatSpec {
  width: number;
  height: number;
}

export const FORMAT_SPECS: Record<OutputFormat, FormatSpec> = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
};

export function convertFormat(
  sourcePath: string,
  targetFormat: OutputFormat
): Promise<string> {
  const spec = FORMAT_SPECS[targetFormat];
  const ext = path.extname(sourcePath);
  const base = sourcePath.replace(ext, "");
  const outputPath = `${base}-${targetFormat.replace(":", "x")}${ext}`;

  log.info({ sourcePath, targetFormat, outputPath }, "Converting format");

  return new Promise((resolve, reject) => {
    let command = ffmpeg(sourcePath);

    if (targetFormat === "16:9") {
      // Letterbox: center 9:16 source on dark 16:9 canvas
      command = command
        .complexFilter([
          `[0:v]scale=${spec.width}:${spec.height}:force_original_aspect_ratio=decrease,pad=${spec.width}:${spec.height}:(ow-iw)/2:(oh-ih)/2:color=black[v]`,
        ])
        .outputOptions(["-map", "[v]", "-map", "0:a?"]);
    } else if (targetFormat === "1:1") {
      // Center-crop: take middle 1080x1080 from 1080x1920
      const cropY = Math.floor((1920 - spec.height) / 2);
      command = command
        .complexFilter([
          `[0:v]crop=${spec.width}:${spec.height}:0:${cropY}[v]`,
        ])
        .outputOptions(["-map", "[v]", "-map", "0:a?"]);
    } else {
      // 9:16 — no conversion needed, just copy
      command = command.outputOptions(["-c", "copy"]);
    }

    command
      .outputOptions(["-c:a", "aac", "-y"])
      .output(outputPath)
      .on("end", () => {
        log.info({ outputPath, targetFormat }, "Format conversion complete");
        resolve(outputPath);
      })
      .on("error", (err: Error) => {
        log.error({ error: err.message, targetFormat }, "Format conversion failed");
        reject(err);
      })
      .run();
  });
}
