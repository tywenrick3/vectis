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

vi.mock("../prompts/index.js", () => ({
  NICHE_PROMPTS: {
    "tech-explainer": "You are a tech explainer.",
    "finance-education": "You are a finance educator.",
  } as Record<string, string>,
}));

// ── Imports (after mocks) ────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "@vectis/shared";
import type { Topic } from "@vectis/shared";
import { writeScript } from "../script-writer.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTopic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: "topic-1",
    niche: "tech-explainer",
    title: "Test Topic",
    description: "A test description",
    score: 80,
    used: false,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeClaudeResponse(body: object) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(body) }],
  };
}

const VALID_PARSED = {
  hook: "Did you know this?",
  body: [
    {
      narration: "Here is the first point.",
      visual_cue: "Show diagram",
      duration_estimate_ms: 8000,
    },
    {
      narration: "And the second point.",
      visual_cue: "Show chart",
      duration_estimate_ms: 7000,
    },
  ],
  cta: "Follow for more!",
  caption: "Mind-blowing tech facts",
  hashtags: ["tech", "facts"],
};

/**
 * Creates a mock Supabase client with per-table chain behaviour.
 * Chains are cached so that `db.from("scripts")` always returns the
 * same object, letting tests inspect `.insert.mock.calls` etc.
 */
function createMockDb(
  tableConfig: Record<string, { data: unknown; error: unknown }>
) {
  function buildChain(resolveValue: { data: unknown; error: unknown }) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    const methods = [
      "from",
      "insert",
      "update",
      "upsert",
      "eq",
      "order",
      "limit",
    ];
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

  const db = {
    from: vi.fn((table: string) => {
      if (!chains.has(table)) {
        const cfg = tableConfig[table] ?? { data: null, error: null };
        chains.set(table, buildChain(cfg));
      }
      return chains.get(table)!;
    }),
  };

  return db;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("writeScript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds full_text by joining hook + body narrations + cta with spaces", async () => {
    mockCreate.mockResolvedValue(makeClaudeResponse(VALID_PARSED));

    const scriptRow = {
      id: "script-1",
      topic_id: "topic-1",
      hook: VALID_PARSED.hook,
      body: VALID_PARSED.body,
      cta: VALID_PARSED.cta,
      full_text:
        "Did you know this? Here is the first point. And the second point. Follow for more!",
      caption: VALID_PARSED.caption,
      hashtags: VALID_PARSED.hashtags,
      estimated_duration_ms: 21000,
      created_at: "2025-01-01T00:00:00Z",
    };

    const mockDb = createMockDb({
      scripts: { data: scriptRow, error: null },
      topics: { data: null, error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    const result = await writeScript(makeTopic());

    // Verify insert was called with correct full_text
    const insertCall = mockDb.from("scripts").insert as ReturnType<
      typeof vi.fn
    >;
    const insertArg = insertCall.mock.calls[0][0];
    expect(insertArg.full_text).toBe(
      "Did you know this? Here is the first point. And the second point. Follow for more!"
    );
    expect(result.full_text).toBe(
      "Did you know this? Here is the first point. And the second point. Follow for more!"
    );
  });

  it("calculates estimated duration as sum of body durations + 6000ms", async () => {
    mockCreate.mockResolvedValue(makeClaudeResponse(VALID_PARSED));

    const expectedDuration = 8000 + 7000 + 6000; // body durations + hook+cta buffer

    const scriptRow = {
      id: "script-1",
      estimated_duration_ms: expectedDuration,
    };

    const mockDb = createMockDb({
      scripts: { data: scriptRow, error: null },
      topics: { data: null, error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await writeScript(makeTopic());

    const insertCall = mockDb.from("scripts").insert as ReturnType<
      typeof vi.fn
    >;
    const insertArg = insertCall.mock.calls[0][0];
    expect(insertArg.estimated_duration_ms).toBe(expectedDuration);
  });

  it("falls back to tech-explainer prompt for unknown niche", async () => {
    mockCreate.mockResolvedValue(makeClaudeResponse(VALID_PARSED));

    const mockDb = createMockDb({
      scripts: { data: { id: "script-1" }, error: null },
      topics: { data: null, error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await writeScript(makeTopic({ niche: "completely-unknown-niche" }));

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        system: "You are a tech explainer.",
      })
    );
  });

  it("throws on JSON parse error from Claude response", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "not valid json!!!" }],
    });

    const mockDb = createMockDb({
      scripts: { data: null, error: null },
      topics: { data: null, error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await expect(writeScript(makeTopic())).rejects.toThrow();
  });

  it("throws when DB insert fails", async () => {
    mockCreate.mockResolvedValue(makeClaudeResponse(VALID_PARSED));

    const mockDb = createMockDb({
      scripts: { data: null, error: { message: "duplicate key" } },
      topics: { data: null, error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await expect(writeScript(makeTopic())).rejects.toThrow(
      "Failed to insert script: duplicate key"
    );
  });

  it("marks topic as used after script creation", async () => {
    mockCreate.mockResolvedValue(makeClaudeResponse(VALID_PARSED));

    const scriptRow = { id: "script-1" };
    const mockDb = createMockDb({
      scripts: { data: scriptRow, error: null },
      topics: { data: null, error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await writeScript(makeTopic({ id: "topic-42" }));

    // Verify db.from("topics") was called
    expect(mockDb.from).toHaveBeenCalledWith("topics");

    // Get the topics chain and verify update + eq were called
    const topicsChain = mockDb.from("topics");
    expect(topicsChain.update).toHaveBeenCalledWith({ used: true });
    expect(topicsChain.eq).toHaveBeenCalledWith("id", "topic-42");
  });
});
