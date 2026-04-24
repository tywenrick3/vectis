import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger } from "@vectis/shared";
import type { GameplayTag } from "./types.js";
import { GAMEPLAY_TAGS } from "./niches.js";
import { discover } from "./discover.js";
import { fetchVideo } from "./fetch.js";
import { probe } from "./probe.js";
import { normalizeClip } from "./normalize.js";
import { uploadFileToR2 } from "./storage.js";
import { existsByVideoId, insertClip } from "./pool.js";

const log = createLogger("gameplay:refresh");

export interface RefreshOptions {
  tag?: GameplayTag;
  maxPerTag?: number;
  minSourceDurationSec?: number;
  maxSourceDurationSec?: number;
  windowDurationSec?: number;
}

export interface TagSummary {
  tag: GameplayTag;
  discovered: number;
  skippedDuplicate: number;
  skippedDuration: number;
  ingested: number;
  failed: number;
}

export interface RefreshSummary {
  tags: TagSummary[];
  totalIngested: number;
  totalFailed: number;
}

export async function refreshPool(
  opts: RefreshOptions = {},
): Promise<RefreshSummary> {
  const {
    tag,
    maxPerTag = 5,
    minSourceDurationSec = 300,
    maxSourceDurationSec = 7200,
    windowDurationSec = 180,
  } = opts;

  const tags: GameplayTag[] = tag ? [tag] : [...GAMEPLAY_TAGS];
  const tempRoot = join(tmpdir(), "vectis-gameplay");
  await mkdir(tempRoot, { recursive: true });

  const summaries: TagSummary[] = [];

  for (const t of tags) {
    const summary: TagSummary = {
      tag: t,
      discovered: 0,
      skippedDuplicate: 0,
      skippedDuration: 0,
      ingested: 0,
      failed: 0,
    };
    log.info({ tag: t, maxPerTag }, "refreshing tag");

    const candidates = await discover({
      tag: t,
      maxPerChannel: 10,
      publishedWithinDays: 365,
    });
    summary.discovered = candidates.length;

    for (const candidate of candidates) {
      if (summary.ingested >= maxPerTag) break;

      if (
        candidate.durationSec < minSourceDurationSec ||
        candidate.durationSec > maxSourceDurationSec
      ) {
        summary.skippedDuration += 1;
        continue;
      }
      if (await existsByVideoId(candidate.videoId)) {
        summary.skippedDuplicate += 1;
        continue;
      }

      const rawPath = join(tempRoot, `${candidate.videoId}.raw.mp4`);
      const normPath = join(tempRoot, `${candidate.videoId}.norm.mp4`);
      // Pick a random window inside the source. Leave 2s padding at start/end.
      const maxStart = Math.max(
        0,
        candidate.durationSec - windowDurationSec - 2,
      );
      const windowStartSec =
        maxStart > 0 ? Math.floor(Math.random() * maxStart) : 0;
      try {
        log.info(
          {
            videoId: candidate.videoId,
            title: candidate.title,
            sourceDurationSec: candidate.durationSec,
            windowStartSec,
            windowDurationSec,
          },
          "ingesting clip",
        );
        await fetchVideo({
          videoUrl: candidate.url,
          outputPath: rawPath,
          windowStartSec,
          windowDurationSec,
        });
        const probed = await probe(rawPath);
        await normalizeClip({
          inputPath: rawPath,
          outputPath: normPath,
          isVertical: probed.isVertical,
        });

        const r2Key = `gameplay/${t}/${candidate.videoId}.mp4`;
        const r2Url = await uploadFileToR2(normPath, r2Key, "video/mp4");

        await insertClip({
          tag: t,
          sourceVideoId: candidate.videoId,
          sourceUrl: candidate.url,
          sourceTitle: candidate.title,
          sourceChannel: candidate.channel,
          sourcePublishedAt: candidate.publishedAt,
          sourceDurationSec: candidate.durationSec,
          clipDurationSec: windowDurationSec,
          viewsAtIngest: candidate.views,
          score: candidate.score,
          r2Key,
          r2Url,
          normalizedWidth: 1080,
          normalizedHeight: 1920,
          wasPreVertical: probed.isVertical,
        });

        summary.ingested += 1;
        log.info({ videoId: candidate.videoId, r2Url }, "ingest complete");
      } catch (err) {
        summary.failed += 1;
        log.error(
          { videoId: candidate.videoId, err: String(err) },
          "ingest failed",
        );
      } finally {
        await rm(rawPath, { force: true }).catch(() => {});
        await rm(normPath, { force: true }).catch(() => {});
      }
    }

    log.info(summary, "tag refresh done");
    summaries.push(summary);
  }

  const totalIngested = summaries.reduce((n, s) => n + s.ingested, 0);
  const totalFailed = summaries.reduce((n, s) => n + s.failed, 0);
  return { tags: summaries, totalIngested, totalFailed };
}
