import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@vectis/shared", () => ({
  getEnv: vi.fn(() => ({
    OPENAI_API_KEY: "test-openai-key",
  })),
  getDb: vi.fn(),
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
  retry: vi.fn((fn: () => Promise<any>) => fn()),
}));

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { getDb } from "@vectis/shared";
import type { VoiceAsset } from "@vectis/shared";
import { transcribe } from "../transcribe.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeVoiceAsset(overrides: Partial<VoiceAsset> = {}): VoiceAsset {
  return {
    id: "va-1",
    script_id: "script-1",
    audio_url: "https://r2.example.com/audio/script-1.mp3",
    duration_ms: 30000,
    cost: 0.03,
    created_at: "2025-01-01T00:00:00Z",
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

describe("transcribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns existing transcription when one already exists (dedup)", async () => {
    const existing = {
      id: "trans-1",
      voice_asset_id: "va-1",
      words: [{ word: "Hello", start_ms: 0, end_ms: 500 }],
      full_text: "Hello",
      duration_ms: 500,
      cost: 0.00005,
      created_at: "2025-01-01T00:00:00Z",
    };

    const mockDb = createMockDb({
      transcriptions: { data: existing, error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    const result = await transcribe(makeVoiceAsset());

    expect(result).toEqual(existing);
    // fetch should NOT have been called since we reused existing
    expect(fetch).not.toHaveBeenCalled?.() ?? true;
  });

  it("parses Whisper word timestamps to milliseconds correctly", async () => {
    // No existing transcription
    const mockDb = createMockDb({
      transcriptions: { data: null, error: null },
    });

    // Override: first call (dedup check) returns null, second call (insert) returns the new row
    let callCount = 0;
    const db: any = {
      from: vi.fn(() => {
        callCount++;
        const chain: Record<string, ReturnType<typeof vi.fn>> = {};
        const methods = ["insert", "update", "upsert", "eq", "order", "limit"];
        for (const m of methods) {
          chain[m] = vi.fn().mockReturnValue(chain);
        }

        if (callCount === 1) {
          // Dedup check: no existing
          chain.select = vi.fn().mockReturnValue(chain);
          chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
        } else {
          // Insert: return the new transcription
          const insertResult = {
            id: "trans-new",
            voice_asset_id: "va-1",
            words: [
              { word: "Hello", start_ms: 0, end_ms: 500 },
              { word: "world", start_ms: 500, end_ms: 1200 },
            ],
            full_text: "Hello world",
            duration_ms: 1200,
            cost: (1200 / 60_000) * 0.006,
          };
          chain.select = vi.fn().mockReturnValue({
            ...chain,
            single: vi.fn().mockResolvedValue({ data: insertResult, error: null }),
          });
        }
        return chain;
      }),
    };
    vi.mocked(getDb).mockReturnValue(db as any);

    // Mock audio download
    const audioBuffer = new ArrayBuffer(1024);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        // First fetch: download audio
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: vi.fn().mockResolvedValue(audioBuffer),
        })
        // Second fetch: Whisper API
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            text: "Hello world",
            words: [
              { word: "Hello", start: 0.0, end: 0.5 },
              { word: "world", start: 0.5, end: 1.2 },
            ],
          }),
        })
    );

    const result = await transcribe(makeVoiceAsset());

    // Verify insert was called with correctly converted timestamps
    const insertCall = db.from.mock.results[1].value.insert as ReturnType<typeof vi.fn>;
    const insertArg = insertCall.mock.calls[0][0];
    expect(insertArg.words).toEqual([
      { word: "Hello", start_ms: 0, end_ms: 500 },
      { word: "world", start_ms: 500, end_ms: 1200 },
    ]);
  });

  it("calculates duration as the last word's end_ms", async () => {
    let callCount = 0;
    const db: any = {
      from: vi.fn(() => {
        callCount++;
        const chain: Record<string, ReturnType<typeof vi.fn>> = {};
        const methods = ["insert", "update", "upsert", "eq", "order", "limit"];
        for (const m of methods) {
          chain[m] = vi.fn().mockReturnValue(chain);
        }

        if (callCount === 1) {
          chain.select = vi.fn().mockReturnValue(chain);
          chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
        } else {
          chain.select = vi.fn().mockReturnValue({
            ...chain,
            single: vi.fn().mockResolvedValue({ data: { id: "trans-1" }, error: null }),
          });
        }
        return chain;
      }),
    };
    vi.mocked(getDb).mockReturnValue(db as any);

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(512)),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            text: "A B C",
            words: [
              { word: "A", start: 0, end: 1.0 },
              { word: "B", start: 1.0, end: 2.5 },
              { word: "C", start: 2.5, end: 4.8 },
            ],
          }),
        })
    );

    await transcribe(makeVoiceAsset());

    const insertCall = db.from.mock.results[1].value.insert as ReturnType<typeof vi.fn>;
    const insertArg = insertCall.mock.calls[0][0];
    expect(insertArg.duration_ms).toBe(4800); // 4.8 * 1000
  });

  it("calculates cost as (durationMs / 60_000) * 0.006", async () => {
    let callCount = 0;
    const db: any = {
      from: vi.fn(() => {
        callCount++;
        const chain: Record<string, ReturnType<typeof vi.fn>> = {};
        const methods = ["insert", "update", "upsert", "eq", "order", "limit"];
        for (const m of methods) {
          chain[m] = vi.fn().mockReturnValue(chain);
        }

        if (callCount === 1) {
          chain.select = vi.fn().mockReturnValue(chain);
          chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
        } else {
          chain.select = vi.fn().mockReturnValue({
            ...chain,
            single: vi.fn().mockResolvedValue({ data: { id: "trans-1" }, error: null }),
          });
        }
        return chain;
      }),
    };
    vi.mocked(getDb).mockReturnValue(db as any);

    // 3 seconds of audio = 3000ms
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(512)),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            text: "word",
            words: [{ word: "word", start: 0, end: 3.0 }],
          }),
        })
    );

    await transcribe(makeVoiceAsset());

    const insertCall = db.from.mock.results[1].value.insert as ReturnType<typeof vi.fn>;
    const insertArg = insertCall.mock.calls[0][0];
    const expectedCost = (3000 / 60_000) * 0.006;
    expect(insertArg.cost).toBeCloseTo(expectedCost);
  });

  it("handles empty words array with duration 0", async () => {
    let callCount = 0;
    const db: any = {
      from: vi.fn(() => {
        callCount++;
        const chain: Record<string, ReturnType<typeof vi.fn>> = {};
        const methods = ["insert", "update", "upsert", "eq", "order", "limit"];
        for (const m of methods) {
          chain[m] = vi.fn().mockReturnValue(chain);
        }

        if (callCount === 1) {
          chain.select = vi.fn().mockReturnValue(chain);
          chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
        } else {
          chain.select = vi.fn().mockReturnValue({
            ...chain,
            single: vi.fn().mockResolvedValue({ data: { id: "trans-1" }, error: null }),
          });
        }
        return chain;
      }),
    };
    vi.mocked(getDb).mockReturnValue(db as any);

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(512)),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            text: "",
            words: [],
          }),
        })
    );

    await transcribe(makeVoiceAsset());

    const insertCall = db.from.mock.results[1].value.insert as ReturnType<typeof vi.fn>;
    const insertArg = insertCall.mock.calls[0][0];
    expect(insertArg.duration_ms).toBe(0);
    expect(insertArg.cost).toBe(0);
  });

  it("throws when audio download fails", async () => {
    let callCount = 0;
    const db: any = {
      from: vi.fn(() => {
        callCount++;
        const chain: Record<string, ReturnType<typeof vi.fn>> = {};
        const methods = ["insert", "update", "upsert", "eq", "order", "limit"];
        for (const m of methods) {
          chain[m] = vi.fn().mockReturnValue(chain);
        }
        chain.select = vi.fn().mockReturnValue(chain);
        chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
        return chain;
      }),
    };
    vi.mocked(getDb).mockReturnValue(db as any);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      })
    );

    await expect(transcribe(makeVoiceAsset())).rejects.toThrow(
      "Failed to download audio: 404"
    );
  });
});
