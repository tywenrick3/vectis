import { createLogger } from "@vectis/shared";

const log = createLogger("analytics:youtube-retention");

export interface VideoRetention {
  avg_view_duration_sec: number;
  avg_view_percentage: number; // normalized 0-1
}

/**
 * Fetches per-video retention metrics from the YouTube Analytics API.
 * Requires the `yt-analytics.readonly` OAuth scope.
 *
 * @param accessToken  OAuth access token with yt-analytics.readonly
 * @param videoIds     List of YouTube video ids to fetch
 * @param startDate    ISO date (YYYY-MM-DD) — should predate the earliest video's publish date
 */
export async function fetchYouTubeRetention(
  accessToken: string,
  videoIds: string[],
  startDate: string
): Promise<Map<string, VideoRetention>> {
  const result = new Map<string, VideoRetention>();
  if (videoIds.length === 0) return result;

  const endDate = new Date().toISOString().slice(0, 10);

  const url = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
  url.searchParams.set("ids", "channel==MINE");
  url.searchParams.set("startDate", startDate);
  url.searchParams.set("endDate", endDate);
  url.searchParams.set("metrics", "averageViewDuration,averageViewPercentage");
  url.searchParams.set("dimensions", "video");
  url.searchParams.set("filters", `video==${videoIds.join(",")}`);

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    log.warn(
      { status: response.status, body: body.slice(0, 200) },
      "YouTube Analytics API request failed"
    );
    return result;
  }

  const data = (await response.json()) as {
    columnHeaders?: { name: string }[];
    rows?: (string | number)[][];
  };

  const headers = data.columnHeaders ?? [];
  const videoIdx = headers.findIndex((h) => h.name === "video");
  const durationIdx = headers.findIndex((h) => h.name === "averageViewDuration");
  const percentageIdx = headers.findIndex(
    (h) => h.name === "averageViewPercentage"
  );

  if (videoIdx === -1 || durationIdx === -1 || percentageIdx === -1) {
    log.warn({ headers }, "Unexpected YouTube Analytics response shape");
    return result;
  }

  for (const row of data.rows ?? []) {
    const videoId = String(row[videoIdx]);
    const durationSec = Number(row[durationIdx]) || 0;
    // API returns percentage as 0-100; normalize to 0-1
    const percentage = (Number(row[percentageIdx]) || 0) / 100;
    result.set(videoId, {
      avg_view_duration_sec: durationSec,
      avg_view_percentage: Math.min(1, Math.max(0, percentage)),
    });
  }

  log.info({ fetched: result.size, requested: videoIds.length }, "YT retention fetched");
  return result;
}
