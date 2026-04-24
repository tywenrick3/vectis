import { google } from "googleapis";
import { getEnv, createLogger } from "@vectis/shared";
import type { GameplayTag } from "./types.js";

const log = createLogger("gameplay:find-channels");

const FIND_QUERIES: Record<GameplayTag, string> = {
  "minecraft-parkour": "no copyright minecraft parkour gameplay",
  "subway-surfers": "no copyright subway surfers gameplay",
};

const NO_COPYRIGHT_PATTERNS = [
  /no\s*copyright/i,
  /copyright\s*free/i,
  /free\s*to\s*use/i,
  /no\s*commentary/i,
  /background\s*footage/i,
  /royalty\s*free/i,
];

export interface ChannelCandidate {
  channelId: string;
  title: string;
  customUrl: string | null;
  description: string;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  url: string;
  tag: GameplayTag;
  flagged: boolean;
}

export interface FindChannelsOptions {
  tag: GameplayTag;
  maxResults?: number;
  query?: string;
}

export async function findChannels(
  opts: FindChannelsOptions,
): Promise<ChannelCandidate[]> {
  const { tag, maxResults = 25, query } = opts;
  const env = getEnv();
  if (!env.YOUTUBE_API_KEY) {
    throw new Error("YOUTUBE_API_KEY not set in environment");
  }
  const yt = google.youtube({ version: "v3", auth: env.YOUTUBE_API_KEY });
  const q = query ?? FIND_QUERIES[tag];

  log.info({ tag, q, maxResults }, "searching for channels");

  const search = await yt.search.list({
    q,
    type: ["channel"],
    maxResults,
    part: ["snippet"],
  });

  const channelIds = (search.data.items ?? [])
    .map((item) => item.snippet?.channelId)
    .filter((id): id is string => typeof id === "string");

  if (channelIds.length === 0) {
    log.warn({ tag }, "no channels found");
    return [];
  }

  const details = await yt.channels.list({
    id: channelIds,
    part: ["snippet", "statistics"],
    maxResults: channelIds.length,
  });

  const candidates: ChannelCandidate[] = (details.data.items ?? []).flatMap(
    (item) => {
      const channelId = item.id;
      const snippet = item.snippet;
      const stats = item.statistics;
      if (!channelId || !snippet || !stats) return [];
      const title = snippet.title ?? "";
      const description = snippet.description ?? "";
      const customUrl = snippet.customUrl ?? null;
      const haystack = `${title} ${description} ${customUrl ?? ""}`;
      const flagged = NO_COPYRIGHT_PATTERNS.some((p) => p.test(haystack));
      return [
        {
          channelId,
          title,
          customUrl,
          description,
          subscriberCount: Number(stats.subscriberCount ?? 0),
          videoCount: Number(stats.videoCount ?? 0),
          viewCount: Number(stats.viewCount ?? 0),
          url: customUrl
            ? `https://www.youtube.com/${customUrl}`
            : `https://www.youtube.com/channel/${channelId}`,
          tag,
          flagged,
        },
      ];
    },
  );

  candidates.sort((a, b) => {
    if (a.flagged !== b.flagged) return a.flagged ? -1 : 1;
    return b.subscriberCount - a.subscriberCount;
  });

  log.info(
    {
      tag,
      found: candidates.length,
      flagged: candidates.filter((c) => c.flagged).length,
    },
    "channels discovered",
  );
  return candidates;
}
