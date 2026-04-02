import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

vi.mock("@vectis/shared", () => ({
  getEnv: vi.fn(() => ({
    ANTHROPIC_API_KEY: "test-key",
  })),
  getDb: vi.fn(),
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { getDb } from "@vectis/shared";
import { generateTopics } from "../topic-generator.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

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
      then: (resolve: any, reject: any) =>
        Promise.resolve(resolveValue).then(resolve, reject),
    });
    // Make chain itself thenable for non-.single() usage
    chain.then = (resolve: any, reject: any) =>
      Promise.resolve(resolveValue).then(resolve, reject);
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

describe("generateTopics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls Claude with correct niche and count in the prompt", async () => {
    const suggestions = [
      { title: "Topic A", description: "Desc A" },
      { title: "Topic B", description: "Desc B" },
    ];

    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify(suggestions) }],
    });

    const topicRows = suggestions.map((s, i) => ({
      id: `topic-${i}`,
      niche: "tech-explainer",
      title: s.title,
      description: s.description,
      score: 0,
      used: false,
    }));

    const mockDb = createMockDb({
      topics: { data: topicRows, error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await generateTopics("tech-explainer", 2);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: expect.stringContaining("tech-explainer"),
          }),
        ],
      })
    );
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: expect.stringContaining("2"),
          }),
        ],
      })
    );
  });

  it("inserts topics with score 0 and used false", async () => {
    const suggestions = [
      { title: "AI chips", description: "How AI chips work" },
    ];

    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify(suggestions) }],
    });

    const mockDb = createMockDb({
      topics: {
        data: [{ id: "t-1", niche: "tech-explainer", ...suggestions[0], score: 0, used: false }],
        error: null,
      },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await generateTopics("tech-explainer", 1);

    const insertCall = mockDb.from("topics").insert as ReturnType<typeof vi.fn>;
    const insertArg = insertCall.mock.calls[0][0];
    expect(insertArg).toEqual([
      {
        niche: "tech-explainer",
        title: "AI chips",
        description: "How AI chips work",
        score: 0,
        used: false,
      },
    ]);
  });

  it("returns the inserted topic rows", async () => {
    const suggestions = [
      { title: "Topic A", description: "Desc A" },
    ];

    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify(suggestions) }],
    });

    const expectedTopics = [
      {
        id: "t-1",
        niche: "tech-explainer",
        title: "Topic A",
        description: "Desc A",
        score: 0,
        used: false,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      },
    ];

    const mockDb = createMockDb({
      topics: { data: expectedTopics, error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    const result = await generateTopics("tech-explainer", 1);
    expect(result).toEqual(expectedTopics);
  });

  it("throws on JSON parse error from Claude response", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "not valid json!!!" }],
    });

    const mockDb = createMockDb({ topics: { data: null, error: null } });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await expect(generateTopics("tech-explainer")).rejects.toThrow();
  });

  it("throws when DB insert fails", async () => {
    const suggestions = [{ title: "T", description: "D" }];
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify(suggestions) }],
    });

    const mockDb = createMockDb({
      topics: { data: null, error: { message: "insert failed" } },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await expect(generateTopics("tech-explainer")).rejects.toThrow(
      "Failed to insert topics: insert failed"
    );
  });

  it("defaults count to 7 when not specified", async () => {
    const suggestions = Array.from({ length: 7 }, (_, i) => ({
      title: `Topic ${i}`,
      description: `Desc ${i}`,
    }));

    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify(suggestions) }],
    });

    const mockDb = createMockDb({
      topics: { data: suggestions, error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await generateTopics("tech-explainer");

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: expect.stringContaining("7"),
          }),
        ],
      })
    );
  });
});
