import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDb } from "@vectis/shared";
import { scoreTopics, percentileRanks } from "../scoring";

vi.mock("@vectis/shared", () => ({
  getDb: vi.fn(),
  createLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

const mockedGetDb = vi.mocked(getDb);

/**
 * Build a mock Supabase client with one chain per table. Each method call
 * returns the same chain (so .select().gte().order() works), and awaiting the
 * chain resolves to { data, error } from `tables[name]`. update/upsert push
 * their argument into a per-table calls array so tests can assert.
 */
function buildDb(tables: Record<string, { data: unknown; error: unknown }>) {
  const updateCalls: Record<string, unknown[]> = {};
  const upsertCalls: Record<string, unknown[]> = {};

  function makeChain(table: string, result: { data: unknown; error: unknown }) {
    const chain: Record<string, unknown> = {};
    const passthrough = ["select", "gte", "lte", "order", "in", "eq", "is", "not"];
    for (const m of passthrough) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    chain.update = vi.fn((arg: unknown) => {
      (updateCalls[table] ??= []).push(arg);
      return chain;
    });
    chain.upsert = vi.fn((arg: unknown) => {
      (upsertCalls[table] ??= []).push(arg);
      return chain;
    });
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject);
    return chain;
  }

  const cached = new Map<string, ReturnType<typeof makeChain>>();
  const db = {
    from: vi.fn((table: string) => {
      if (!cached.has(table)) {
        cached.set(table, makeChain(table, tables[table] ?? { data: null, error: null }));
      }
      return cached.get(table)!;
    }),
  };

  return { db, updateCalls, upsertCalls };
}

function snapshot(opts: {
  run: string;
  platform: string;
  views: number;
  likes?: number;
  comments?: number;
  shares?: number;
  completion?: number | null;
  fetched_at?: string;
}) {
  return {
    pipeline_run_id: opts.run,
    platform: opts.platform,
    views: opts.views,
    likes: opts.likes ?? 0,
    comments: opts.comments ?? 0,
    shares: opts.shares ?? 0,
    completion_rate: opts.completion ?? null,
    fetched_at: opts.fetched_at ?? new Date().toISOString(),
  };
}

function runRow(id: string, topic: string, completedAt = new Date().toISOString()) {
  return { id, topic_id: topic, completed_at: completedAt, started_at: completedAt };
}

describe("percentileRanks", () => {
  it("returns empty for empty input", () => {
    expect(percentileRanks([])).toEqual([]);
  });

  it("returns 0.5 for single-element input", () => {
    expect(percentileRanks([42])).toEqual([0.5]);
  });

  it("ranks from 0 to 1 across n elements", () => {
    expect(percentileRanks([10, 20, 30, 40, 50])).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it("preserves input order", () => {
    expect(percentileRanks([50, 10, 30])).toEqual([1, 0, 0.5]);
  });

  it("gives ties the same rank (averaged)", () => {
    // values: [10, 10, 20]  -> sorted [10, 10, 20], ranks [0, 0, 2]
    // tie average of positions 0,1 => 0.5; then normalized over n-1=2:
    // [0.25, 0.25, 1.0]
    expect(percentileRanks([10, 10, 20])).toEqual([0.25, 0.25, 1]);
  });

  it("is robust to a single huge outlier", () => {
    // The outlier sits at rank n-1; the rest are still spread linearly.
    const ranks = percentileRanks([1, 2, 3, 4, 1_000_000]);
    expect(ranks).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });
});

describe("scoreTopics", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getDb).mockReset();
  });

  it("returns 0 when no snapshots exist", async () => {
    const { db } = buildDb({
      analytics_snapshots: { data: [], error: null },
    });
    mockedGetDb.mockReturnValue(db);
    expect(await scoreTopics()).toBe(0);
  });

  it("throws when snapshots fetch errors", async () => {
    const { db } = buildDb({
      analytics_snapshots: { data: null, error: { message: "boom" } },
    });
    mockedGetDb.mockReturnValue(db);
    await expect(scoreTopics()).rejects.toThrow("Failed to fetch snapshots: boom");
  });

  it("ignores runs with no platform tag", async () => {
    const snaps = [snapshot({ run: "r1", platform: "", views: 100 })];
    const runs = [runRow("r1", "t1")];
    const { db } = buildDb({
      analytics_snapshots: { data: snaps, error: null },
      pipeline_runs: { data: runs, error: null },
    });
    mockedGetDb.mockReturnValue(db);
    expect(await scoreTopics()).toBe(0);
  });

  it("scores a single platform cohort and writes per-platform + rollup", async () => {
    // Two YT runs, fresh (age ≈ 0). Run-1 dominates engagement, run-2 dominates reach.
    const now = new Date().toISOString();
    const snaps = [
      snapshot({
        run: "r1",
        platform: "youtube",
        views: 100,
        likes: 50,
        comments: 20,
        shares: 5,
        completion: 0.8,
        fetched_at: now,
      }),
      snapshot({
        run: "r2",
        platform: "youtube",
        views: 1000,
        likes: 10,
        comments: 1,
        shares: 0,
        completion: 0.2,
        fetched_at: now,
      }),
    ];
    const runs = [runRow("r1", "topic-A", now), runRow("r2", "topic-B", now)];

    const { db, upsertCalls, updateCalls } = buildDb({
      analytics_snapshots: { data: snaps, error: null },
      pipeline_runs: { data: runs, error: null },
      topic_platform_scores: { data: null, error: null },
      topics: { data: null, error: null },
    });
    mockedGetDb.mockReturnValue(db);

    const result = await scoreTopics();
    expect(result).toBe(2);

    // Two upserts to topic_platform_scores, one per topic
    const platformWrites = (upsertCalls.topic_platform_scores ?? []) as Array<{
      topic_id: string;
      platform: string;
      score: number;
    }>;
    expect(platformWrites).toHaveLength(2);

    const a = platformWrites.find((w) => w.topic_id === "topic-A")!;
    const b = platformWrites.find((w) => w.topic_id === "topic-B")!;

    // run-1 (topic-A): retention=1, engagement=1, reach=0 → 0.5+0.3+0 = 0.8 → 80
    // run-2 (topic-B): retention=0, engagement=0, reach=1 → 0+0+0.2 = 0.2 → 20
    // Decay ≈ 1 since age ≈ 0.
    expect(a.platform).toBe("youtube");
    expect(b.platform).toBe("youtube");
    expect(a.score).toBe(80);
    expect(b.score).toBe(20);

    // The retention winner beats the reach winner — that's the whole point.
    expect(a.score).toBeGreaterThan(b.score);

    // Two rollup updates to topics (one per topic)
    expect(updateCalls.topics).toHaveLength(2);
  });

  it("isolates platform cohorts: TT giant doesn't sink YT scores", async () => {
    const now = new Date().toISOString();
    const snaps = [
      // YT cohort: a clear winner and loser
      snapshot({
        run: "y1",
        platform: "youtube",
        views: 100,
        likes: 50,
        comments: 20,
        shares: 10,
        completion: 0.9,
        fetched_at: now,
      }),
      snapshot({
        run: "y2",
        platform: "youtube",
        views: 50,
        likes: 5,
        comments: 1,
        shares: 0,
        completion: 0.1,
        fetched_at: now,
      }),
      // TT giant — would dominate min-max normalization but is in a different cohort
      snapshot({
        run: "t1",
        platform: "tiktok",
        views: 10_000_000,
        likes: 1_000_000,
        comments: 50_000,
        shares: 100_000,
        completion: 0.95,
        fetched_at: now,
      }),
    ];
    const runs = [
      runRow("y1", "topic-Y1", now),
      runRow("y2", "topic-Y2", now),
      runRow("t1", "topic-T1", now),
    ];

    const { db, upsertCalls } = buildDb({
      analytics_snapshots: { data: snaps, error: null },
      pipeline_runs: { data: runs, error: null },
      topic_platform_scores: { data: null, error: null },
      topics: { data: null, error: null },
    });
    mockedGetDb.mockReturnValue(db);

    await scoreTopics();

    const writes = (upsertCalls.topic_platform_scores ?? []) as Array<{
      topic_id: string;
      platform: string;
      score: number;
    }>;

    const y1 = writes.find((w) => w.topic_id === "topic-Y1")!;
    const y2 = writes.find((w) => w.topic_id === "topic-Y2")!;
    const t1 = writes.find((w) => w.topic_id === "topic-T1")!;

    expect(y1.platform).toBe("youtube");
    expect(t1.platform).toBe("tiktok");
    // YT winner is at the top of its own cohort (score 100), not crushed by TT.
    expect(y1.score).toBe(100);
    expect(y2.score).toBe(0);
    // TT solo run gets the single-element percentile (0.5) → ~50.
    expect(t1.score).toBeGreaterThanOrEqual(40);
    expect(t1.score).toBeLessThanOrEqual(60);
  });

  it("decays older runs vs fresh ones", async () => {
    const now = Date.now();
    const fresh = new Date(now).toISOString();
    const old = new Date(now - 28 * 24 * 60 * 60 * 1000).toISOString(); // 28 days = 2 half-lives

    // Two identical runs, only age differs. Both have the same percentiles
    // (0.5 each), so any score difference is from decay alone.
    const snaps = [
      snapshot({
        run: "fresh",
        platform: "youtube",
        views: 100,
        likes: 10,
        comments: 5,
        shares: 2,
        completion: 0.5,
        fetched_at: fresh,
      }),
      snapshot({
        run: "old",
        platform: "youtube",
        views: 100,
        likes: 10,
        comments: 5,
        shares: 2,
        completion: 0.5,
        fetched_at: fresh,
      }),
    ];
    const runs = [
      runRow("fresh", "topic-Fresh", fresh),
      runRow("old", "topic-Old", old),
    ];

    const { db, upsertCalls } = buildDb({
      analytics_snapshots: { data: snaps, error: null },
      pipeline_runs: { data: runs, error: null },
      topic_platform_scores: { data: null, error: null },
      topics: { data: null, error: null },
    });
    mockedGetDb.mockReturnValue(db);

    await scoreTopics();

    const writes = (upsertCalls.topic_platform_scores ?? []) as Array<{
      topic_id: string;
      score: number;
    }>;
    const freshScore = writes.find((w) => w.topic_id === "topic-Fresh")!.score;
    const oldScore = writes.find((w) => w.topic_id === "topic-Old")!.score;

    // Both runs are tied on every metric → both get percentile 0.5 → composite = 0.5.
    // Fresh: decay ≈ 1 → ≈ 50. Old (28d, 2 half-lives): decay ≈ 0.25 → ≈ 12-13.
    expect(freshScore).toBeGreaterThan(oldScore);
    expect(freshScore).toBeGreaterThanOrEqual(45);
    expect(freshScore).toBeLessThanOrEqual(55);
    expect(oldScore).toBeGreaterThanOrEqual(10);
    expect(oldScore).toBeLessThanOrEqual(15);
  });

  it("falls back to engagement + reach when retention is null", async () => {
    const now = new Date().toISOString();
    // Run with no completion_rate — the legacy case. Should still be scored
    // (not zeroed) by renormalizing the remaining two weights.
    const snaps = [
      snapshot({
        run: "legacy",
        platform: "youtube",
        views: 100,
        likes: 50,
        comments: 10,
        shares: 5,
        completion: null,
        fetched_at: now,
      }),
      snapshot({
        run: "loser",
        platform: "youtube",
        views: 10,
        likes: 0,
        comments: 0,
        shares: 0,
        completion: null,
        fetched_at: now,
      }),
    ];
    const runs = [
      runRow("legacy", "topic-Legacy", now),
      runRow("loser", "topic-Loser", now),
    ];

    const { db, upsertCalls } = buildDb({
      analytics_snapshots: { data: snaps, error: null },
      pipeline_runs: { data: runs, error: null },
      topic_platform_scores: { data: null, error: null },
      topics: { data: null, error: null },
    });
    mockedGetDb.mockReturnValue(db);

    await scoreTopics();

    const writes = (upsertCalls.topic_platform_scores ?? []) as Array<{
      topic_id: string;
      score: number;
    }>;
    const legacy = writes.find((w) => w.topic_id === "topic-Legacy")!;
    const loser = writes.find((w) => w.topic_id === "topic-Loser")!;
    // Legacy is the engagement + reach winner → top of cohort = 100.
    // Loser is at the bottom = 0.
    expect(legacy.score).toBe(100);
    expect(loser.score).toBe(0);
  });

  it("skips runs without topic_id", async () => {
    const now = new Date().toISOString();
    const snaps = [
      snapshot({ run: "r1", platform: "youtube", views: 100, fetched_at: now }),
      snapshot({ run: "r2", platform: "youtube", views: 50, fetched_at: now }),
    ];
    const runs = [
      runRow("r1", "topic-1", now),
      { id: "r2", topic_id: null, completed_at: now, started_at: now },
    ];

    const { db, upsertCalls } = buildDb({
      analytics_snapshots: { data: snaps, error: null },
      pipeline_runs: { data: runs, error: null },
      topic_platform_scores: { data: null, error: null },
      topics: { data: null, error: null },
    });
    mockedGetDb.mockReturnValue(db);

    await scoreTopics();
    const writes = upsertCalls.topic_platform_scores ?? [];
    expect(writes).toHaveLength(1);
  });
});
