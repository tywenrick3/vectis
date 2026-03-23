import { getDb, createLogger, retry, type VideoAsset, type Script } from "@vectis/shared";
import { refreshTokenIfNeeded } from "./auth.js";

const log = createLogger("publisher:tiktok:upload");

export async function publishToTikTok(
  video: VideoAsset,
  script: Script
): Promise<string> {
  const db = getDb();
  const creds = await refreshTokenIfNeeded();

  log.info({ videoId: video.id }, "Publishing to TikTok");

  // Step 1: Initialize upload with PULL_FROM_URL
  const initResponse = await fetch(
    "https://open.tiktokapis.com/v2/post/publish/video/init/",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.access_token}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: script.caption,
          privacy_level: "PUBLIC_TO_EVERYONE",
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: "PULL_FROM_URL",
          video_url: video.video_url,
        },
      }),
    }
  );

  if (!initResponse.ok) {
    const err = await initResponse.text();
    throw new Error(`TikTok publish init failed: ${err}`);
  }

  const initData = await initResponse.json();
  const publishId = initData.data.publish_id;

  log.info({ publishId }, "Publish initiated, polling status");

  // Step 2: Poll for completion
  const finalStatus = await retry(
    async () => {
      const statusResponse = await fetch(
        "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${creds.access_token}`,
            "Content-Type": "application/json; charset=UTF-8",
          },
          body: JSON.stringify({ publish_id: publishId }),
        }
      );

      const statusData = await statusResponse.json();
      const status = statusData.data.status;

      if (status === "PUBLISH_COMPLETE") return status;
      if (status === "FAILED") {
        throw new Error(
          `TikTok publish failed: ${statusData.data.fail_reason}`
        );
      }
      throw new Error(`Still processing: ${status}`);
    },
    { maxAttempts: 10, delayMs: 15000, backoffMultiplier: 1.5 }
  );

  log.info({ publishId, status: finalStatus }, "Published to TikTok");
  return publishId;
}
