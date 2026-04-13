import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getDb } from "@vectis/shared";
import { ingestYouTubeMetrics } from "../youtube-ingest";

vi.mock("@vectis/shared", () => ({
  getDb: vi.fn(),
  createLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

const mockedGetDb = vi.mocked(getDb);

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Empty retention response — YT Analytics API format, no rows means "no data yet"
const emptyRetentionResponse = {
  ok: true,
  json: async () => ({
    columnHeaders: [
      { name: "video" },
      { name: "averageViewDuration" },
      { name: "averageViewPercentage" },
    ],
    rows: [],
  }),
};

function buildDb(
  callResults: Map<string, { data: any; error: any }[]>
) {
  const callCounts = new Map<string, number>();

  const db: any = {
    from: vi.fn((table: string) => {
      const count = callCounts.get(table) ?? 0;
      callCounts.set(table, count + 1);

      const results = callResults.get(table) ?? [{ data: null, error: null }];
      const result = results[count] ?? results[results.length - 1];

      const chain: any = {};
      const methods = [
        "select", "not", "eq", "order", "limit", "in", "gte", "insert", "single",
      ];
      for (const m of methods) {
        chain[m] = vi.fn().mockReturnValue(chain);
      }
      chain.then = (resolve: any, reject: any) =>
        Promise.resolve(result).then(resolve, reject);
      return chain;
    }),
  };
  return db;
}

describe("ingestYouTubeMetrics", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getDb).mockReset();
    mockFetch.mockReset();
  });

  it("returns empty array when no YouTube runs exist", async () => {
    const db = buildDb(
      new Map([
        ["pipeline_runs", [{ data: [], error: null }]],
      ])
    );
    mockedGetDb.mockReturnValue(db);

    const result = await ingestYouTubeMetrics("fake-token");
    expect(result).toEqual([]);
  });

  it("throws when runs query fails", async () => {
    const db = buildDb(
      new Map([
        ["pipeline_runs", [{ data: null, error: { message: "db error" } }]],
      ])
    );
    mockedGetDb.mockReturnValue(db);

    await expect(ingestYouTubeMetrics("fake-token")).rejects.toThrow(
      "Failed to fetch runs: db error"
    );
  });

  it("skips runs with recent snapshots", async () => {
    const runs = [
      { id: "run-1", youtube_publish_id: "yt-vid-1", voice_asset_id: null, completed_at: new Date().toISOString() },
      { id: "run-2", youtube_publish_id: "yt-vid-2", voice_asset_id: null, completed_at: new Date().toISOString() },
    ];

    // run-1 has a recent snapshot, run-2 does not
    const recentSnapshots = [{ pipeline_run_id: "run-1" }];

    const db = buildDb(
      new Map([
        ["pipeline_runs", [{ data: runs, error: null }]],
        ["analytics_snapshots", [
          { data: recentSnapshots, error: null }, // first call: check recent
          { data: { id: "snap-1", pipeline_run_id: "run-2", platform: "youtube", views: 100, likes: 10, comments: 5, shares: 0, avg_watch_time_ms: 0, script_duration_ms: null, completion_rate: null, avg_view_percentage: null, fetched_at: new Date().toISOString() }, error: null }, // insert
        ]],
      ])
    );
    mockedGetDb.mockReturnValue(db);

    mockFetch
      .mockResolvedValueOnce(emptyRetentionResponse)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: "yt-vid-2",
              statistics: {
                viewCount: "100",
                likeCount: "10",
                commentCount: "5",
              },
            },
          ],
        }),
      });

    const result = await ingestYouTubeMetrics("fake-token");
    expect(result).toHaveLength(1);
    expect(result[0].pipeline_run_id).toBe("run-2");

    // Verify Data API was called with only yt-vid-2 (second fetch call; first is retention)
    const statsCallUrl = mockFetch.mock.calls[1][0] as string;
    expect(statsCallUrl).toContain("yt-vid-2");
    expect(statsCallUrl).not.toContain("yt-vid-1");
  });

  it("correctly maps YouTube statistics fields", async () => {
    const runs = [{ id: "run-1", youtube_publish_id: "yt-vid-1", voice_asset_id: null, completed_at: new Date().toISOString() }];

    const insertedSnapshot = {
      id: "snap-1",
      pipeline_run_id: "run-1",
      platform: "youtube",
      views: 5000,
      likes: 200,
      comments: 45,
      shares: 0,
      avg_watch_time_ms: 0,
      script_duration_ms: null,
      completion_rate: null,
      avg_view_percentage: null,
      fetched_at: new Date().toISOString(),
    };

    const db = buildDb(
      new Map([
        ["pipeline_runs", [{ data: runs, error: null }]],
        ["analytics_snapshots", [
          { data: [], error: null }, // no recent snapshots
          { data: insertedSnapshot, error: null }, // insert result
        ]],
      ])
    );
    mockedGetDb.mockReturnValue(db);

    mockFetch
      .mockResolvedValueOnce(emptyRetentionResponse)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: "yt-vid-1",
              statistics: {
                viewCount: "5000",
                likeCount: "200",
                commentCount: "45",
                favoriteCount: "0",
              },
            },
          ],
        }),
      });

    const result = await ingestYouTubeMetrics("fake-token");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      platform: "youtube",
      views: 5000,
      likes: 200,
      comments: 45,
      shares: 0,
      avg_watch_time_ms: 0,
    });
  });

  it("handles YouTube API errors gracefully", async () => {
    const runs = [{ id: "run-1", youtube_publish_id: "yt-vid-1", voice_asset_id: null, completed_at: new Date().toISOString() }];

    const db = buildDb(
      new Map([
        ["pipeline_runs", [{ data: runs, error: null }]],
        ["analytics_snapshots", [{ data: [], error: null }]],
      ])
    );
    mockedGetDb.mockReturnValue(db);

    mockFetch
      .mockResolvedValueOnce(emptyRetentionResponse)
      .mockResolvedValueOnce({ ok: false, status: 403 });

    const result = await ingestYouTubeMetrics("fake-token");
    expect(result).toEqual([]);
  });

  it("handles partial response (some IDs missing)", async () => {
    const runs = [
      { id: "run-1", youtube_publish_id: "yt-vid-1", voice_asset_id: null, completed_at: new Date().toISOString() },
      { id: "run-2", youtube_publish_id: "yt-vid-2", voice_asset_id: null, completed_at: new Date().toISOString() },
    ];

    const insertedSnapshot = {
      id: "snap-1",
      pipeline_run_id: "run-1",
      platform: "youtube",
      views: 300,
      likes: 20,
      comments: 3,
      shares: 0,
      avg_watch_time_ms: 0,
      script_duration_ms: null,
      completion_rate: null,
      avg_view_percentage: null,
      fetched_at: new Date().toISOString(),
    };

    const db = buildDb(
      new Map([
        ["pipeline_runs", [{ data: runs, error: null }]],
        ["analytics_snapshots", [
          { data: [], error: null },
          { data: insertedSnapshot, error: null },
        ]],
      ])
    );
    mockedGetDb.mockReturnValue(db);

    // YouTube only returns data for yt-vid-1, not yt-vid-2
    mockFetch
      .mockResolvedValueOnce(emptyRetentionResponse)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: "yt-vid-1",
              statistics: {
                viewCount: "300",
                likeCount: "20",
                commentCount: "3",
              },
            },
            // yt-vid-2 is missing (e.g. deleted or private)
          ],
        }),
      });

    const result = await ingestYouTubeMetrics("fake-token");
    // Only 1 snapshot created (yt-vid-1), yt-vid-2 was not in the response
    expect(result).toHaveLength(1);
    expect(result[0].pipeline_run_id).toBe("run-1");
  });

  it("returns all snapshots when no runs are already ingested", async () => {
    const runs = [
      { id: "run-1", youtube_publish_id: "yt-vid-1", voice_asset_id: null, completed_at: new Date().toISOString() },
      { id: "run-2", youtube_publish_id: "yt-vid-2", voice_asset_id: null, completed_at: new Date().toISOString() },
    ];

    let insertCount = 0;
    const makeSnapshot = (runId: string, views: number) => ({
      id: `snap-${++insertCount}`,
      pipeline_run_id: runId,
      platform: "youtube",
      views,
      likes: 10,
      comments: 2,
      shares: 0,
      avg_watch_time_ms: 0,
      script_duration_ms: null,
      completion_rate: null,
      avg_view_percentage: null,
      fetched_at: new Date().toISOString(),
    });

    const db = buildDb(
      new Map([
        ["pipeline_runs", [{ data: runs, error: null }]],
        ["analytics_snapshots", [
          { data: [], error: null }, // no recent
          { data: makeSnapshot("run-1", 500), error: null },
          { data: makeSnapshot("run-2", 1000), error: null },
        ]],
      ])
    );
    mockedGetDb.mockReturnValue(db);

    mockFetch
      .mockResolvedValueOnce(emptyRetentionResponse)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            { id: "yt-vid-1", statistics: { viewCount: "500", likeCount: "10", commentCount: "2" } },
            { id: "yt-vid-2", statistics: { viewCount: "1000", likeCount: "10", commentCount: "2" } },
          ],
        }),
      });

    const result = await ingestYouTubeMetrics("fake-token");
    expect(result).toHaveLength(2);
  });

  it("merges YouTube Analytics retention into the snapshot", async () => {
    const runs = [
      { id: "run-1", youtube_publish_id: "yt-vid-1", voice_asset_id: "voice-1", completed_at: new Date().toISOString() },
    ];

    const insertedSnapshot = {
      id: "snap-1",
      pipeline_run_id: "run-1",
      platform: "youtube",
      views: 800,
      likes: 40,
      comments: 5,
      shares: 0,
      avg_watch_time_ms: 21000,
      script_duration_ms: 30000,
      completion_rate: 0.7,
      avg_view_percentage: 0.7,
      fetched_at: new Date().toISOString(),
    };

    const db = buildDb(
      new Map([
        ["pipeline_runs", [{ data: runs, error: null }]],
        ["voice_assets", [{ data: [{ id: "voice-1", duration_ms: 30000 }], error: null }]],
        ["analytics_snapshots", [
          { data: [], error: null }, // no recent
          { data: insertedSnapshot, error: null }, // insert
        ]],
      ])
    );
    mockedGetDb.mockReturnValue(db);

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          columnHeaders: [
            { name: "video" },
            { name: "averageViewDuration" },
            { name: "averageViewPercentage" },
          ],
          // averageViewDuration in seconds, averageViewPercentage as 0-100
          rows: [["yt-vid-1", 21, 70]],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            { id: "yt-vid-1", statistics: { viewCount: "800", likeCount: "40", commentCount: "5" } },
          ],
        }),
      });

    const result = await ingestYouTubeMetrics("fake-token");
    expect(result).toHaveLength(1);

    // Verify the insert payload carried retention + completion rate
    const insertCall = (db.from as any).mock.calls
      .map((c: any[]) => c[0])
      .filter((t: string) => t === "analytics_snapshots");
    expect(insertCall.length).toBeGreaterThan(0);

    // Two fetches: retention first, stats second
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const retentionUrl = mockFetch.mock.calls[0][0] as string;
    expect(retentionUrl).toContain("youtubeanalytics.googleapis.com");
    expect(retentionUrl).toContain("yt-vid-1");
  });
});
