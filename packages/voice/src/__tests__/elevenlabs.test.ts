import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@vectis/shared", () => ({
  getEnv: vi.fn(() => ({
    ELEVENLABS_API_KEY: "test-key",
    ELEVENLABS_VOICE_ID: "test-voice",
    R2_BUCKET_NAME: "test-bucket",
    R2_PUBLIC_URL: "https://r2.example.com",
  })),
  getDb: vi.fn(),
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock("../storage.js", () => ({
  uploadToR2: vi.fn(),
}));

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { getDb } from "@vectis/shared";
import { uploadToR2 } from "../storage.js";
import type { Script } from "@vectis/shared";
import { synthesize } from "../elevenlabs.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeScript(overrides: Partial<Script> = {}): Script {
  return {
    id: "script-1",
    topic_id: "topic-1",
    hook: "Did you know?",
    body: [],
    cta: "Follow for more!",
    full_text: "Hello world, this is a test script for voice synthesis.",
    caption: "Test caption",
    hashtags: ["test"],
    estimated_duration_ms: 30000,
    created_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

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

function mockFetchOk(audioData: ArrayBuffer = new ArrayBuffer(1024)) {
  return vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: vi.fn().mockResolvedValue(audioData),
  });
}

function mockFetchError(status: number, body: string) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    text: vi.fn().mockResolvedValue(body),
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("synthesize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetchOk());
    vi.mocked(uploadToR2).mockResolvedValue(
      "https://r2.example.com/audio/script-1.mp3"
    );
  });

  it("estimates duration correctly: Math.round((text.length / 15) * 1000)", async () => {
    const script = makeScript({
      full_text: "A".repeat(150), // 150 chars -> Math.round((150/15)*1000) = 10000
    });
    const expectedDuration = Math.round((150 / 15) * 1000);

    const voiceRow = {
      id: "va-1",
      script_id: script.id,
      audio_url: "https://r2.example.com/audio/script-1.mp3",
      duration_ms: expectedDuration,
      cost: (150 / 1000) * 0.06,
      created_at: "2025-01-01T00:00:00Z",
    };

    const mockDb = createMockDb({
      voice_assets: { data: voiceRow, error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await synthesize(script);

    const insertCall = mockDb.from("voice_assets").insert as ReturnType<
      typeof vi.fn
    >;
    const insertArg = insertCall.mock.calls[0][0];
    expect(insertArg.duration_ms).toBe(expectedDuration);
  });

  it("estimates cost correctly: (text.length / 1000) * 0.06", async () => {
    const script = makeScript({
      full_text: "B".repeat(500), // 500 chars -> (500/1000)*0.06 = 0.03
    });
    const expectedCost = (500 / 1000) * 0.06;

    const voiceRow = { id: "va-1" };

    const mockDb = createMockDb({
      voice_assets: { data: voiceRow, error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await synthesize(script);

    const insertCall = mockDb.from("voice_assets").insert as ReturnType<
      typeof vi.fn
    >;
    const insertArg = insertCall.mock.calls[0][0];
    expect(insertArg.cost).toBeCloseTo(expectedCost);
  });

  it("calls ElevenLabs API with correct URL, headers, and body", async () => {
    const script = makeScript();

    const mockDb = createMockDb({
      voice_assets: { data: { id: "va-1" }, error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await synthesize(script);

    expect(fetch).toHaveBeenCalledWith(
      "https://api.elevenlabs.io/v1/text-to-speech/test-voice?output_format=mp3_44100_128",
      {
        method: "POST",
        headers: {
          "xi-api-key": "test-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: script.full_text,
          model_id: "eleven_flash_v2_5",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3,
          },
        }),
      }
    );
  });

  it("uploads audio buffer to R2 with correct key format (audio/{scriptId}.mp3)", async () => {
    const audioData = new ArrayBuffer(2048);
    vi.stubGlobal("fetch", mockFetchOk(audioData));

    const script = makeScript({ id: "script-xyz" });

    const mockDb = createMockDb({
      voice_assets: { data: { id: "va-1" }, error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await synthesize(script);

    expect(uploadToR2).toHaveBeenCalledWith(
      Buffer.from(audioData),
      "audio/script-xyz.mp3",
      "audio/mpeg"
    );
  });

  it("throws on non-ok ElevenLabs response", async () => {
    vi.stubGlobal("fetch", mockFetchError(429, "Rate limit exceeded"));

    const script = makeScript();

    const mockDb = createMockDb({
      voice_assets: { data: null, error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await expect(synthesize(script)).rejects.toThrow(
      "ElevenLabs API error: 429 Rate limit exceeded"
    );
  });

  it("throws when DB insert fails", async () => {
    const script = makeScript();

    const mockDb = createMockDb({
      voice_assets: {
        data: null,
        error: { message: "constraint violation" },
      },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await expect(synthesize(script)).rejects.toThrow(
      "Failed to insert voice asset: constraint violation"
    );
  });
});
