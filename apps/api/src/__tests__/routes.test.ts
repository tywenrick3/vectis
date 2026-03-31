import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@vectis/shared", () => ({
  getEnv: vi.fn(() => ({
    API_KEY: "test-api-key",
    TIKTOK_CLIENT_KEY: "tk-client-key",
    TIKTOK_REDIRECT_URI: "http://localhost:3000/oauth/tiktok/callback",
  })),
  getDb: vi.fn(),
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock("@vectis/ideation", () => ({
  generateTopics: vi.fn(),
  writeScript: vi.fn(),
}));

vi.mock("@vectis/voice", () => ({
  synthesize: vi.fn(),
}));

vi.mock("@vectis/video", () => ({
  renderVideo: vi.fn(),
}));

vi.mock("@vectis/publisher", () => ({
  publishToTikTok: vi.fn(),
  handleTikTokCallback: vi.fn(),
}));

vi.mock("@vectis/analytics", () => ({
  ingestMetrics: vi.fn(),
  scoreTopics: vi.fn(),
}));

import { app } from "../app.js";
import { getDb } from "@vectis/shared";
import { generateTopics, writeScript } from "@vectis/ideation";
import { synthesize } from "@vectis/voice";
import { renderVideo } from "@vectis/video";
import { publishToTikTok, handleTikTokCallback } from "@vectis/publisher";
import { ingestMetrics, scoreTopics } from "@vectis/analytics";

const AUTH_HEADERS = {
  "x-api-key": "test-api-key",
  "Content-Type": "application/json",
};

/**
 * Creates a mock DB chain that tracks which table .from() targets.
 * Each method returns the chain itself; .single() is the terminal call
 * whose return value can be configured per table.
 */
function createMockDbChain(
  tableResults: Record<string, { data: any; error: any }>
) {
  let currentTable = "";

  const mockChain: any = {};
  const methods = [
    "select",
    "insert",
    "update",
    "eq",
    "order",
    "limit",
    "not",
  ];

  mockChain.from = vi.fn((table: string) => {
    currentTable = table;
    return mockChain;
  });

  for (const m of methods) {
    mockChain[m] = vi.fn().mockReturnValue(mockChain);
  }

  mockChain.single = vi.fn(() => {
    const result = tableResults[currentTable] ?? {
      data: null,
      error: null,
    };
    return Promise.resolve(result);
  });

  return mockChain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// POST /ideate
// ---------------------------------------------------------------------------
describe("POST /ideate", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/ideate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ niche: "tech-explainer" }),
    });
    expect(res.status).toBe(401);
  });

  it("picks an unused topic and writes a script", async () => {
    const mockChain = createMockDbChain({
      pipeline_runs: { data: { id: "run-1" }, error: null },
      topics: {
        data: { id: "topic-1", niche: "tech-explainer", used: false },
        error: null,
      },
    });
    vi.mocked(getDb).mockReturnValue(mockChain as any);

    vi.mocked(writeScript).mockResolvedValue({
      id: "script-1",
      body: "Hello world",
    } as any);

    const res = await app.request("/ideate", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ niche: "tech-explainer" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pipeline_run_id).toBe("run-1");
    expect(body.topic_id).toBe("topic-1");
    expect(body.script_id).toBe("script-1");
  });

  it("generates new topics when no unused topics exist", async () => {
    const mockChain = createMockDbChain({
      pipeline_runs: { data: { id: "run-2" }, error: null },
      topics: { data: null, error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockChain as any);

    vi.mocked(generateTopics).mockResolvedValue([
      { id: "new-topic-1", niche: "tech-explainer", title: "AI 101" },
    ] as any);
    vi.mocked(writeScript).mockResolvedValue({
      id: "script-2",
      body: "Generated script",
    } as any);

    const res = await app.request("/ideate", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ niche: "tech-explainer" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pipeline_run_id).toBe("run-2");
    expect(body.topic_id).toBe("new-topic-1");
    expect(body.script_id).toBe("script-2");
    expect(generateTopics).toHaveBeenCalledWith("tech-explainer");
  });

  it("returns 500 on error with error message", async () => {
    const mockChain = createMockDbChain({
      pipeline_runs: { data: null, error: { message: "DB connection lost" } },
    });
    vi.mocked(getDb).mockReturnValue(mockChain as any);

    const res = await app.request("/ideate", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ niche: "tech-explainer" }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("DB connection lost");
  });
});

// ---------------------------------------------------------------------------
// POST /voice
// ---------------------------------------------------------------------------
describe("POST /voice", () => {
  it("returns 400 when missing required params", async () => {
    const res = await app.request("/voice", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("pipeline_run_id and script_id required");
  });

  it("returns 200 with voice asset data on success", async () => {
    const mockChain = createMockDbChain({
      scripts: {
        data: { id: "script-1", body: "Hello world" },
        error: null,
      },
      pipeline_runs: { data: { id: "run-1" }, error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockChain as any);

    vi.mocked(synthesize).mockResolvedValue({
      id: "voice-1",
      audio_url: "https://cdn.example.com/voice-1.mp3",
      duration_ms: 5000,
    } as any);

    const res = await app.request("/voice", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        pipeline_run_id: "run-1",
        script_id: "script-1",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pipeline_run_id).toBe("run-1");
    expect(body.voice_asset_id).toBe("voice-1");
    expect(body.audio_url).toBe("https://cdn.example.com/voice-1.mp3");
    expect(body.duration_ms).toBe(5000);
  });

  it("returns 500 and sets pipeline to failed on error", async () => {
    const mockChain = createMockDbChain({
      scripts: { data: null, error: { message: "not found" } },
      pipeline_runs: { data: null, error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockChain as any);

    vi.mocked(synthesize).mockRejectedValue(new Error("TTS service down"));

    const res = await app.request("/voice", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        pipeline_run_id: "run-1",
        script_id: "script-1",
      }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// POST /render
// ---------------------------------------------------------------------------
describe("POST /render", () => {
  it("returns 400 when missing params", async () => {
    const res = await app.request("/render", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ pipeline_run_id: "run-1" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe(
      "pipeline_run_id, script_id, and voice_asset_id required"
    );
  });

  it("returns 200 with video data on success", async () => {
    const mockChain = createMockDbChain({
      scripts: {
        data: { id: "script-1", body: "Hello", topic_id: "topic-1" },
        error: null,
      },
      voice_assets: {
        data: {
          id: "voice-1",
          audio_url: "https://cdn.example.com/voice-1.mp3",
        },
        error: null,
      },
      topics: {
        data: { niche: "tech-explainer" },
        error: null,
      },
      pipeline_runs: { data: null, error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockChain as any);

    vi.mocked(renderVideo).mockResolvedValue({
      id: "video-1",
      video_url: "https://cdn.example.com/video-1.mp4",
      duration_ms: 30000,
    } as any);

    const res = await app.request("/render", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        pipeline_run_id: "run-1",
        script_id: "script-1",
        voice_asset_id: "voice-1",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pipeline_run_id).toBe("run-1");
    expect(body.video_id).toBe("video-1");
    expect(body.video_url).toBe("https://cdn.example.com/video-1.mp4");
    expect(body.duration_ms).toBe(30000);
  });
});

// ---------------------------------------------------------------------------
// POST /publish
// ---------------------------------------------------------------------------
describe("POST /publish", () => {
  it("returns 400 when missing params", async () => {
    const res = await app.request("/publish", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ pipeline_run_id: "run-1" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe(
      "pipeline_run_id, video_id, and script_id required"
    );
  });

  it("returns 200 with publish data on success", async () => {
    const mockChain = createMockDbChain({
      videos: {
        data: {
          id: "video-1",
          video_url: "https://cdn.example.com/video-1.mp4",
        },
        error: null,
      },
      scripts: {
        data: { id: "script-1", body: "Hello", title: "Test" },
        error: null,
      },
      pipeline_runs: { data: null, error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockChain as any);

    vi.mocked(publishToTikTok).mockResolvedValue("tiktok-pub-1" as any);

    const res = await app.request("/publish", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        pipeline_run_id: "run-1",
        video_id: "video-1",
        script_id: "script-1",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pipeline_run_id).toBe("run-1");
    expect(body.tiktok_publish_id).toBe("tiktok-pub-1");
    expect(body.status).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// POST /analytics/ingest
// ---------------------------------------------------------------------------
describe("POST /analytics/ingest", () => {
  it("returns 200 with snapshots_created and topics_scored", async () => {
    vi.mocked(ingestMetrics).mockResolvedValue([
      { id: "snap-1" },
      { id: "snap-2" },
      { id: "snap-3" },
    ] as any);
    vi.mocked(scoreTopics).mockResolvedValue(5 as any);

    const res = await app.request("/analytics/ingest", {
      method: "POST",
      headers: AUTH_HEADERS,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.snapshots_created).toBe(3);
    expect(body.topics_scored).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// GET /oauth/tiktok
// ---------------------------------------------------------------------------
describe("GET /oauth/tiktok", () => {
  it("redirects to TikTok auth URL with correct params", async () => {
    const res = await app.request("/oauth/tiktok");

    expect(res.status).toBe(302);
    const location = res.headers.get("location");
    expect(location).toBeDefined();
    expect(location).toContain("https://www.tiktok.com/v2/auth/authorize/");
    expect(location).toContain("client_key=tk-client-key");
    expect(location).toContain(
      "redirect_uri=" +
        encodeURIComponent("http://localhost:3000/oauth/tiktok/callback")
    );
    expect(location).toContain("response_type=code");
    expect(location).toContain("scope=user.info.basic");
  });
});

// ---------------------------------------------------------------------------
// GET /oauth/tiktok/callback
// ---------------------------------------------------------------------------
describe("GET /oauth/tiktok/callback", () => {
  it("returns 400 when error query param is present", async () => {
    const res = await app.request(
      "/oauth/tiktok/callback?error=access_denied"
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("access_denied");
  });

  it("returns 400 when code is missing", async () => {
    const res = await app.request("/oauth/tiktok/callback");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Missing authorization code");
  });

  it("returns 200 with open_id on success", async () => {
    vi.mocked(handleTikTokCallback).mockResolvedValue({
      open_id: "tiktok-user-123",
      access_token: "tok-abc",
    } as any);

    const res = await app.request(
      "/oauth/tiktok/callback?code=auth-code-xyz"
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.open_id).toBe("tiktok-user-123");
    expect(handleTikTokCallback).toHaveBeenCalledWith("auth-code-xyz");
  });
});
