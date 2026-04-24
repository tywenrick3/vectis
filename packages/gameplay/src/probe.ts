import ffmpeg from "fluent-ffmpeg";

export interface ProbeResult {
  width: number;
  height: number;
  durationSec: number;
  isVertical: boolean;
}

export function probe(filePath: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      const stream = data.streams.find((s) => s.codec_type === "video");
      if (!stream) return reject(new Error("no video stream"));
      const width = stream.width ?? 0;
      const height = stream.height ?? 0;
      const durationSec = Math.floor(Number(data.format.duration ?? 0));
      resolve({
        width,
        height,
        durationSec,
        isVertical: height > width,
      });
    });
  });
}
