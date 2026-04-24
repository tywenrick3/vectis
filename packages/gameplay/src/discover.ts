import { google } from "googleapis";
import { getEnv, createLogger } from "@vectis/shared";
import type { Candidate, GameplayTag } from "./types.js";
import { TAG_CHANNELS, TAG_TITLE_PATTERNS } from "./niches.js";

const log = createLogger("gameplay:discover");

export interface DiscoverOptions {
  tag: GameplayTag;
  maxPerChannel?: number;
  publishedWithinDays?: number;
  minDurationSec?: number;
}

export async function discover(opts: DiscoverOptions): Promise<Candidate[]> {
  const {
    tag,
    maxPerChannel = 10,
    publishedWithinDays = 365,
    minDurationSec = 0,
  } = opts;
  const env = getEnv();
  if (!env.YOUTUBE_API_KEY) {
    throw new Error("YOUTUBE_API_KEY not set in environment");
  }
  const yt = google.youtube({ version: "v3", auth: env.YOUTUBE_API_KEY });

  const channels = TAG_CHANNELS[tag];
  if (!channels || channels.length === 0) {
    log.warn({ tag }, "no seeded channels for tag");
    return [];
  }

  log.info(
    { tag, channels: channels.length, publishedWithinDays, maxPerChannel },
    "pulling latest uploads per channel",
  );

  const cutoff = Date.now() - publishedWithinDays * 24 * 60 * 60 * 1000;
  const videoIds: string[] = [];

  for (const channel of channels) {
    // YouTube trick: a channel's uploads playlist ID is the channel ID with UC → UU.
    const uploadsPlaylistId = channel.channelId.replace(/^UC/, "UU");
    try {
      const uploads = await yt.playlistItems.list({
        playlistId: uploadsPlaylistId,
        part: ["contentDetails"],
        maxResults: Math.max(maxPerChannel, 5),
      });
      const recent = (uploads.data.items ?? [])
        .filter((item) => {
          const published = item.contentDetails?.videoPublishedAt;
          return (
            typeof published === "string" &&
            new Date(published).getTime() >= cutoff
          );
        })
        .map((item) => item.contentDetails?.videoId)
        .filter((id): id is string => typeof id === "string")
        .slice(0, maxPerChannel);
      videoIds.push(...recent);
    } catch (err) {
      log.warn(
        { channel: channel.handle, err: String(err) },
        "failed to fetch uploads",
      );
    }
  }

  if (videoIds.length === 0) {
    log.warn({ tag }, "no recent uploads across all channels");
    return [];
  }

  const details = await yt.videos.list({
    id: videoIds,
    part: ["snippet", "contentDetails", "statistics"],
    maxResults: videoIds.length,
  });

  const titlePattern = TAG_TITLE_PATTERNS[tag];
  const candidates: Candidate[] = (details.data.items ?? []).flatMap((item) => {
    const videoId = item.id;
    const snippet = item.snippet;
    const contentDetails = item.contentDetails;
    const stats = item.statistics;
    if (!videoId || !snippet || !contentDetails) return [];
    const title = snippet.title ?? "";
    if (!titlePattern.test(title)) return [];
    const publishedAt = snippet.publishedAt ?? new Date().toISOString();
    const durationSec = parseIsoDurationToSeconds(
      contentDetails.duration ?? "PT0S",
    );
    if (durationSec < minDurationSec) return [];
    const views = Number(stats?.viewCount ?? 0);
    return [
      {
        videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title,
        channel: snippet.channelTitle ?? "",
        publishedAt,
        durationSec,
        views,
        score: durationSec,
        tag,
      },
    ];
  });

  candidates.sort((a, b) => {
    if (b.durationSec !== a.durationSec) return b.durationSec - a.durationSec;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });

  log.info(
    { tag, videosCollected: videoIds.length, candidates: candidates.length },
    "discovered",
  );
  return candidates;
}

function parseIsoDurationToSeconds(iso: string): number {
  const match = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return 0;
  const h = Number(match[1] ?? 0);
  const m = Number(match[2] ?? 0);
  const s = Number(match[3] ?? 0);
  return h * 3600 + m * 60 + s;
}
