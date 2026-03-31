import { getDb, createLogger, retry, type VideoAsset, type Script } from "@vectis/shared";
import { refreshYouTubeToken } from "./auth.js";

const log = createLogger("publisher:youtube:upload");

const UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";

export async function publishToYouTube(
  video: VideoAsset,
  script: Script
): Promise<string> {
  const db = getDb();
  const creds = await refreshYouTubeToken();

  log.info({ videoId: video.id }, "Publishing to YouTube Shorts");

  // Step 1: Download the video from R2
  const videoResponse = await fetch(video.video_url);
  if (!videoResponse.ok) throw new Error("Failed to download video from storage");
  const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());

  // Step 2: Initialize resumable upload
  const metadata = {
    snippet: {
      title: script.caption.slice(0, 100),
      description: `${script.hook}\n\n${script.cta}\n\n${script.hashtags.map((t) => `#${t}`).join(" ")}`,
      tags: script.hashtags.slice(0, 30),
      categoryId: "28", // Science & Technology
    },
    status: {
      privacyStatus: "public",
      selfDeclaredMadeForKids: false,
    },
  };

  const initResponse = await fetch(
    `${UPLOAD_URL}?uploadType=resumable&part=snippet,status`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.access_token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(videoBuffer.length),
        "X-Upload-Content-Type": "video/mp4",
      },
      body: JSON.stringify(metadata),
    }
  );

  if (!initResponse.ok) {
    const err = await initResponse.text();
    throw new Error(`YouTube upload init failed: ${initResponse.status} ${err}`);
  }

  const uploadUrl = initResponse.headers.get("Location");
  if (!uploadUrl) throw new Error("No resumable upload URL returned");

  // Step 3: Upload the video bytes
  const uploadResponse = await retry(
    async () => {
      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(videoBuffer.length),
        },
        body: videoBuffer,
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`YouTube upload failed: ${res.status} ${err}`);
      }

      return res.json();
    },
    { maxAttempts: 3, delayMs: 5000 }
  );

  const youtubeVideoId: string = uploadResponse.id;

  log.info({ youtubeVideoId }, "Published to YouTube Shorts");
  return youtubeVideoId;
}
