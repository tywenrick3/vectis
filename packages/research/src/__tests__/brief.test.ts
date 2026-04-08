import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@vectis/shared", () => ({
  getDb: vi.fn(),
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

const { mockSearch, mockBatchScrape, mockGetPerformanceContext } = vi.hoisted(() => ({
  mockSearch: vi.fn(),
  mockBatchScrape: vi.fn(),
  mockGetPerformanceContext: vi.fn(),
}));

vi.mock("@vectis/analytics", () => ({
  getPerformanceContext: mockGetPerformanceContext,
}));

vi.mock("../tavily.js", () => ({
  search: mockSearch,
}));

vi.mock("../firecrawl.js", () => ({
  batchScrape: mockBatchScrape,
}));

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { getDb } from "@vectis/shared";
import { buildResearchBrief } from "../brief.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSearchResult(overrides: Partial<{
  title: string;
  url: string;
  content: string;
  score: number;
  published_date: string | null;
}> = {}) {
  return {
    title: "Default Title",
    url: "https://example.com",
    content: "Default content that is long enough to slice properly in the mapping functions.",
    score: 0.8,
    published_date: "2025-06-01",
    ...overrides,
  };
}

function createMockDb(
  tableConfig: Record<string, { data: unknown; error: unknown }>
) {
  function buildChain(resolveValue: { data: unknown; error: unknown }) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    const methods = ["from", "insert", "update", "upsert", "eq", "order", "limit", "in"];
    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    chain.single = vi.fn().mockResolvedValue(resolveValue);
    chain.select = vi.fn().mockReturnValue({
      ...chain,
      single: vi.fn().mockResolvedValue(resolveValue),
    });
    // Make the chain thenable so `await db.from(...).select(...).eq(...)...limit(N)` works
    chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolveValue));
    return chain;
  }

  const chains = new Map<string, ReturnType<typeof buildChain>>();

  return {
    from: vi.fn((table: string) => {
      if (!chains.has(table)) {
        const cfg = tableConfig[table] ?? { data: null, error: null };
        chains.set(table, buildChain(cfg));
      }
      return chains.get(table)!;
    }),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("buildResearchBrief", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPerformanceContext.mockResolvedValue({
      recently_covered: [],
      top_performers: [],
      low_performers: [],
    });
  });

  it("runs 7 parallel searches for the niche", async () => {
    mockSearch.mockResolvedValue([makeSearchResult()]);
    mockBatchScrape.mockResolvedValue([]);

    const briefRow = { id: "brief-1", niche: "tech-explainer" };
    const mockDb = createMockDb({
      research_briefs: { data: briefRow, error: null },
      topics: { data: [], error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await buildResearchBrief("tech-explainer");

    expect(mockSearch).toHaveBeenCalledTimes(7);
    // All search queries should mention the niche
    for (const call of mockSearch.mock.calls) {
      expect(call[0]).toContain("tech-explainer");
    }
  });

  it("maps trending results to TrendingTopic with velocity = round(score * 100)", async () => {
    const trendingResult = makeSearchResult({
      title: "AI Trends",
      url: "https://ai.com",
      score: 0.73,
      published_date: "2025-06-15",
    });

    mockSearch.mockResolvedValue([trendingResult]);
    mockBatchScrape.mockResolvedValue([]);

    const briefRow = {
      id: "brief-1",
      niche: "tech-explainer",
      trending_topics: [
        {
          title: "AI Trends",
          source: "https://ai.com",
          velocity: 73,
          freshness: "2025-06-15",
        },
      ],
    };
    const mockDb = createMockDb({
      research_briefs: { data: briefRow, error: null },
      topics: { data: [], error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await buildResearchBrief("tech-explainer");

    const insertCall = mockDb.from("research_briefs").insert as ReturnType<typeof vi.fn>;
    const insertArg = insertCall.mock.calls[0][0];

    expect(insertArg.trending_topics[0]).toEqual({
      title: "AI Trends",
      source: "https://ai.com",
      velocity: 73,
      freshness: "2025-06-15",
    });
  });

  it("slices news content to 300 chars for summary", async () => {
    const longContent = "A".repeat(500);
    const newsResult = makeSearchResult({ content: longContent });

    mockSearch.mockResolvedValue([newsResult]);
    mockBatchScrape.mockResolvedValue([]);

    const mockDb = createMockDb({
      research_briefs: { data: { id: "b-1" }, error: null },
      topics: { data: [], error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await buildResearchBrief("tech-explainer");

    const insertCall = mockDb.from("research_briefs").insert as ReturnType<typeof vi.fn>;
    const insertArg = insertCall.mock.calls[0][0];

    expect(insertArg.recent_news[0].summary).toHaveLength(300);
  });

  it("scrapes top URLs from all categories (score > 0.5, deduped, max 8)", async () => {
    const highScore1 = makeSearchResult({ score: 0.9, url: "https://high1.com" });
    const highScore2 = makeSearchResult({ score: 0.8, url: "https://high2.com" });
    const lowScore = makeSearchResult({ score: 0.3, url: "https://low.com" });
    const duplicate = makeSearchResult({ score: 0.7, url: "https://high1.com" }); // same URL as highScore1

    // Each of 7 searches returns different results
    mockSearch
      .mockResolvedValueOnce([highScore1])       // trending
      .mockResolvedValueOnce([highScore2])        // news
      .mockResolvedValueOnce([lowScore])          // competitor
      .mockResolvedValueOnce([])                  // saturation
      .mockResolvedValueOnce([duplicate])         // source (duplicate URL)
      .mockResolvedValueOnce([])                  // insider
      .mockResolvedValueOnce([]);                 // events

    mockBatchScrape.mockResolvedValue([
      { url: "https://high1.com", markdown: "Content 1" },
      { url: "https://high2.com", markdown: "Content 2" },
    ]);

    const mockDb = createMockDb({
      research_briefs: { data: { id: "b-1" }, error: null },
      topics: { data: [], error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await buildResearchBrief("tech-explainer");

    // Should scrape high1 (0.9) and high2 (0.8), skip low (0.3), dedupe duplicate
    expect(mockBatchScrape).toHaveBeenCalledWith(["https://high1.com", "https://high2.com"]);
  });

  it("skips extraction when no sources score > 0.5", async () => {
    mockSearch.mockResolvedValue([makeSearchResult({ score: 0.2 })]);
    mockBatchScrape.mockResolvedValue([]);

    const mockDb = createMockDb({
      research_briefs: { data: { id: "b-1" }, error: null },
      topics: { data: [], error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await buildResearchBrief("tech-explainer");

    expect(mockBatchScrape).not.toHaveBeenCalled();
  });

  it("includes recently_covered from performance context on returned brief", async () => {
    mockSearch.mockResolvedValue([]);
    mockBatchScrape.mockResolvedValue([]);

    const recentTopics = [
      { title: "Old Topic 1", description: "desc 1" },
      { title: "Old Topic 2", description: "desc 2" },
    ];

    mockGetPerformanceContext.mockResolvedValue({
      recently_covered: recentTopics,
      top_performers: [],
      low_performers: [],
    });

    const mockDb = createMockDb({
      research_briefs: { data: { id: "b-1" }, error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    const brief = await buildResearchBrief("tech-explainer");

    expect(brief.recently_covered).toEqual([
      { title: "Old Topic 1", description: "desc 1" },
      { title: "Old Topic 2", description: "desc 2" },
    ]);
  });

  it("throws when DB insert fails", async () => {
    mockSearch.mockResolvedValue([]);
    mockBatchScrape.mockResolvedValue([]);

    const mockDb = createMockDb({
      research_briefs: {
        data: null,
        error: { message: "insert failed" },
      },
      topics: { data: [], error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await expect(buildResearchBrief("tech-explainer")).rejects.toThrow(
      "Failed to store research brief: insert failed"
    );
  });

  it("uses 'unknown' for freshness when published_date is null", async () => {
    const result = makeSearchResult({ published_date: null });
    mockSearch.mockResolvedValue([result]);
    mockBatchScrape.mockResolvedValue([]);

    const mockDb = createMockDb({
      research_briefs: { data: { id: "b-1" }, error: null },
      topics: { data: [], error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await buildResearchBrief("tech-explainer");

    const insertCall = mockDb.from("research_briefs").insert as ReturnType<typeof vi.fn>;
    const insertArg = insertCall.mock.calls[0][0];

    expect(insertArg.trending_topics[0].freshness).toBe("unknown");
  });
});
