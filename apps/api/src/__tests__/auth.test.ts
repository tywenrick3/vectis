import { describe, it, expect, vi } from "vitest";

vi.mock("@vectis/shared", () => ({
  getEnv: vi.fn(() => ({ API_KEY: "test-api-key" })),
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

describe("API key authentication", () => {
  it("returns 401 when no x-api-key header is provided", async () => {
    const res = await app.request("/ideate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ niche: "tech-explainer" }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when x-api-key is wrong", async () => {
    const res = await app.request("/ideate", {
      method: "POST",
      headers: {
        "x-api-key": "wrong-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ niche: "tech-explainer" }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("allows request through when x-api-key matches", async () => {
    // We need getDb to return a mock so the route handler doesn't blow up
    const { getDb } = await import("@vectis/shared");
    const mockChain = createMockDbChain();
    mockChain.single.mockResolvedValue({
      data: { id: "run-1" },
      error: null,
    });
    vi.mocked(getDb).mockReturnValue(mockChain as any);

    // Also mock writeScript so the ideate route can complete
    const { generateTopics, writeScript } = await import("@vectis/ideation");
    vi.mocked(writeScript).mockResolvedValue({
      id: "script-1",
      body: "test script",
    } as any);

    const res = await app.request("/ideate", {
      method: "POST",
      headers: {
        "x-api-key": "test-api-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ niche: "tech-explainer" }),
    });

    // Should NOT be 401 — auth passed
    expect(res.status).not.toBe(401);
  });
});

function createMockDbChain() {
  const mockChain: any = {};
  const methods = [
    "from",
    "select",
    "insert",
    "update",
    "eq",
    "order",
    "limit",
    "not",
  ];
  for (const m of methods) {
    mockChain[m] = vi.fn().mockReturnValue(mockChain);
  }
  mockChain.single = vi.fn().mockResolvedValue({ data: null, error: null });
  return mockChain;
}
