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

const mockSearch = vi.fn();
const mockExtract = vi.fn();
vi.mock("../tavily.js", () => ({
  search: mockSearch,
  extract: mockExtract,
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
    const methods = ["from", "insert", "update", "upsert", "eq", "order", "limit"];
    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    chain.single = vi.fn().mockResolvedValue(resolveValue);
    chain.select = vi.fn().mockReturnValue({
      ...chain,
      single: vi.fn().mockResolvedValue(resolveValue),
    });
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
  });

  it("runs 5 parallel searches for the niche", async () => {
    mockSearch.mockResolvedValue([makeSearchResult()]);
    mockExtract.mockResolvedValue([]);

    const briefRow = { id: "brief-1", niche: "tech-explainer" };
    const mockDb = createMockDb({
      research_briefs: { data: briefRow, error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await buildResearchBrief("tech-explainer");

    expect(mockSearch).toHaveBeenCalledTimes(5);
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
    mockExtract.mockResolvedValue([]);

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
    mockExtract.mockResolvedValue([]);

    const mockDb = createMockDb({
      research_briefs: { data: { id: "b-1" }, error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await buildResearchBrief("tech-explainer");

    const insertCall = mockDb.from("research_briefs").insert as ReturnType<typeof vi.fn>;
    const insertArg = insertCall.mock.calls[0][0];

    // All 5 search calls return the same results; recent_news comes from index 1
    expect(insertArg.recent_news[0].summary).toHaveLength(300);
  });

  it("only extracts sources with score > 0.5", async () => {
    const highScore = makeSearchResult({ score: 0.9, url: "https://high.com" });
    const lowScore = makeSearchResult({ score: 0.3, url: "https://low.com" });

    // 4 searches return empty, 5th (sources) returns high and low
    mockSearch
      .mockResolvedValueOnce([]) // trending
      .mockResolvedValueOnce([]) // news
      .mockResolvedValueOnce([]) // competitor
      .mockResolvedValueOnce([]) // saturation
      .mockResolvedValueOnce([highScore, lowScore]); // sources

    mockExtract.mockResolvedValue([
      { url: "https://high.com", content: "Extracted content" },
    ]);

    const mockDb = createMockDb({
      research_briefs: { data: { id: "b-1" }, error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await buildResearchBrief("tech-explainer");

    // Extract should only be called with high-score URLs
    expect(mockExtract).toHaveBeenCalledWith(["https://high.com"]);
  });

  it("skips extraction when no sources score > 0.5", async () => {
    mockSearch.mockResolvedValue([makeSearchResult({ score: 0.2 })]);
    mockExtract.mockResolvedValue([]);

    const mockDb = createMockDb({
      research_briefs: { data: { id: "b-1" }, error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await buildResearchBrief("tech-explainer");

    // The 5th search returns score 0.2, so no extraction
    // But since all 5 return the same mock, the last one has score 0.2
    // Actually: mockSearch.mockResolvedValue applies to all calls
    // So all 5 return [{score: 0.2}], which means sources have score 0.2
    // Therefore extract should not be called
    expect(mockExtract).not.toHaveBeenCalled();
  });

  it("throws when DB insert fails", async () => {
    mockSearch.mockResolvedValue([]);
    mockExtract.mockResolvedValue([]);

    const mockDb = createMockDb({
      research_briefs: {
        data: null,
        error: { message: "insert failed" },
      },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await expect(buildResearchBrief("tech-explainer")).rejects.toThrow(
      "Failed to store research brief: insert failed"
    );
  });

  it("uses 'unknown' for freshness when published_date is null", async () => {
    const result = makeSearchResult({ published_date: null });
    mockSearch.mockResolvedValue([result]);
    mockExtract.mockResolvedValue([]);

    const mockDb = createMockDb({
      research_briefs: { data: { id: "b-1" }, error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await buildResearchBrief("tech-explainer");

    const insertCall = mockDb.from("research_briefs").insert as ReturnType<typeof vi.fn>;
    const insertArg = insertCall.mock.calls[0][0];

    expect(insertArg.trending_topics[0].freshness).toBe("unknown");
  });
});
