import { create } from "youtube-dl-exec";
import { createLogger } from "@vectis/shared";

const log = createLogger("gameplay:fetch");

// Resolve yt-dlp binary: explicit env override first, then PATH.
const ytDlpBinary = process.env.YT_DLP_PATH ?? "yt-dlp";
const ytdl = create(ytDlpBinary);

export interface FetchOptions {
  videoUrl: string;
  outputPath: string;
  maxHeight?: number;
  windowStartSec?: number;
  windowDurationSec?: number;
}

export async function fetchVideo(opts: FetchOptions): Promise<void> {
  const {
    videoUrl,
    outputPath,
    maxHeight = 1080,
    windowStartSec,
    windowDurationSec,
  } = opts;
  log.info(
    { videoUrl, outputPath, maxHeight, windowStartSec, windowDurationSec },
    "downloading",
  );

  // Prefer best video-only stream (YouTube serves 1080p as DASH, not muxed mp4).
  // Audio is stripped in normalize, so we don't need a muxed format.
  const format = `bv*[height<=${maxHeight}]/b[height<=${maxHeight}]`;

  const baseArgs = {
    output: outputPath,
    format,
    noPlaylist: true,
    noWarnings: true,
    quiet: true,
    noCheckCertificates: true,
    preferFreeFormats: true,
  };

  if (
    typeof windowStartSec === "number" &&
    typeof windowDurationSec === "number"
  ) {
    const start = Math.max(0, Math.floor(windowStartSec));
    const end = start + Math.ceil(windowDurationSec);
    // yt-dlp accepts HH:MM:SS or seconds; use HH:MM:SS for stability.
    const section = `*${fmt(start)}-${fmt(end)}`;
    // Note: no forceKeyframesAtCuts — that flag forces a full source download
    // + ffmpeg re-encode to place exact keyframes at cuts. Ranged download
    // snaps to the nearest keyframe, which is fine for loopable backgrounds.
    await ytdl(videoUrl, {
      ...baseArgs,
      downloadSections: section,
    });
  } else {
    await ytdl(videoUrl, baseArgs);
  }

  log.info({ outputPath }, "download complete");
}

function fmt(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
