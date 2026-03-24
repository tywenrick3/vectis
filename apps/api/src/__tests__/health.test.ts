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

describe("GET /health", () => {
  it("returns 200 with status ok and timestamp", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
    expect(typeof body.timestamp).toBe("string");
    // Verify it's a valid ISO timestamp
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it("does not require authentication", async () => {
    // No x-api-key header provided — should still succeed
    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });
});
