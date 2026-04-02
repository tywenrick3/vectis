import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@vectis/shared", () => ({
  getEnv: vi.fn(() => ({
    YOUTUBE_CLIENT_ID: "test-client-id",
    YOUTUBE_CLIENT_SECRET: "test-client-secret",
    YOUTUBE_REDIRECT_URI: "https://example.com/youtube/callback",
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
import {
  getAuthUrl,
  handleYouTubeCallback,
  refreshYouTubeToken,
} from "../youtube/auth.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── getAuthUrl ──────────────────────────────────────────────────────────────

describe("getAuthUrl", () => {
  it("returns a Google OAuth URL with correct params", () => {
    const url = getAuthUrl();

    expect(url).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url).toContain("client_id=test-client-id");
    expect(url).toContain(
      "redirect_uri=" +
        encodeURIComponent("https://example.com/youtube/callback")
    );
    expect(url).toContain("response_type=code");
    expect(url).toContain("access_type=offline");
    expect(url).toContain("prompt=consent");
  });

  it("includes upload and readonly scopes", () => {
    const url = getAuthUrl();

    expect(url).toContain(
      encodeURIComponent("https://www.googleapis.com/auth/youtube.upload")
    );
    expect(url).toContain(
      encodeURIComponent("https://www.googleapis.com/auth/youtube.readonly")
    );
  });
});

// ── handleYouTubeCallback ───────────────────────────────────────────────────

describe("handleYouTubeCallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exchanges auth code, fetches channel, and stores credentials", async () => {
    const tokenData = {
      access_token: "yt-access-123",
      refresh_token: "yt-refresh-456",
      expires_in: 3600, // 1 hour
    };

    const channelData = {
      items: [{ id: "UC-channel-123" }],
    };

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        // First call: token exchange
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue(tokenData),
        })
        // Second call: channel fetch
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue(channelData),
        })
    );

    const storedRow = {
      id: "cred-1",
      channel_id: "UC-channel-123",
      access_token: "yt-access-123",
      refresh_token: "yt-refresh-456",
    };

    const mockDb = createMockDb({
      youtube_credentials: { data: storedRow, error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    const result = await handleYouTubeCallback("auth-code-xyz");

    // Verify token exchange fetch
    expect(fetch).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/token",
      expect.objectContaining({ method: "POST" })
    );

    // Verify channel fetch with bearer token
    expect(fetch).toHaveBeenCalledWith(
      "https://www.googleapis.com/youtube/v3/channels?part=id&mine=true",
      { headers: { Authorization: "Bearer yt-access-123" } }
    );

    expect(result.channel_id).toBe("UC-channel-123");
    expect(result.access_token).toBe("yt-access-123");
  });

  it("throws on failed token exchange", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        text: vi.fn().mockResolvedValue("invalid_grant"),
      })
    );

    const mockDb = createMockDb({
      youtube_credentials: { data: null, error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await expect(handleYouTubeCallback("bad-code")).rejects.toThrow(
      "YouTube token exchange failed: invalid_grant"
    );
  });

  it("throws when no YouTube channel is found", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ access_token: "tok", refresh_token: "ref", expires_in: 3600 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ items: [] }),
        })
    );

    const mockDb = createMockDb({
      youtube_credentials: { data: null, error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await expect(handleYouTubeCallback("code")).rejects.toThrow(
      "No YouTube channel found for this account"
    );
  });

  it("throws on DB upsert error", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ access_token: "a", refresh_token: "r", expires_in: 3600 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ items: [{ id: "UC-1" }] }),
        })
    );

    const mockDb = createMockDb({
      youtube_credentials: {
        data: null,
        error: { message: "unique constraint violated" },
      },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await expect(handleYouTubeCallback("code")).rejects.toThrow(
      "Failed to store credentials: unique constraint violated"
    );
  });
});

// ── refreshYouTubeToken ─────────────────────────────────────────────────────

describe("refreshYouTubeToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-01T12:00:00Z"));
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns existing credentials when token not near expiry", async () => {
    const threeHoursFromNow = new Date(
      Date.now() + 3 * 60 * 60 * 1000
    ).toISOString();

    const existingCreds = {
      id: "cred-1",
      channel_id: "UC-1",
      access_token: "access-still-valid",
      refresh_token: "refresh-456",
      access_token_expires_at: threeHoursFromNow,
      updated_at: "2025-06-01T10:00:00Z",
    };

    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const m of ["select", "order", "limit", "update", "eq"]) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    chain.single = vi.fn().mockResolvedValue({
      data: existingCreds,
      error: null,
    });

    const mockDb = { from: vi.fn().mockReturnValue(chain) };
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    const result = await refreshYouTubeToken();

    expect(result.access_token).toBe("access-still-valid");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refreshes token when within 1-hour buffer of expiry", async () => {
    const thirtyMinutesFromNow = new Date(
      Date.now() + 30 * 60 * 1000
    ).toISOString();

    const existingCreds = {
      id: "cred-1",
      channel_id: "UC-1",
      access_token: "access-expiring",
      refresh_token: "refresh-456",
      access_token_expires_at: thirtyMinutesFromNow,
      updated_at: "2025-06-01T10:00:00Z",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: "access-new",
          expires_in: 3600,
        }),
      })
    );

    const updatedRow = {
      ...existingCreds,
      access_token: "access-new",
    };

    let callCount = 0;
    const mockDb = {
      from: vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          const selectChain: Record<string, ReturnType<typeof vi.fn>> = {};
          for (const m of ["select", "order", "limit"]) {
            selectChain[m] = vi.fn().mockReturnValue(selectChain);
          }
          selectChain.single = vi.fn().mockResolvedValue({
            data: existingCreds,
            error: null,
          });
          return selectChain;
        } else {
          const updateChain: Record<string, ReturnType<typeof vi.fn>> = {};
          for (const m of ["update", "eq"]) {
            updateChain[m] = vi.fn().mockReturnValue(updateChain);
          }
          updateChain.select = vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: updatedRow,
              error: null,
            }),
          });
          return updateChain;
        }
      }),
    };
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    const result = await refreshYouTubeToken();

    expect(fetch).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/token",
      expect.objectContaining({ method: "POST" })
    );

    const fetchCall = vi.mocked(fetch).mock.calls[0];
    const body = fetchCall[1]!.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("refresh-456");

    expect(result.access_token).toBe("access-new");
  });

  it("throws when no credentials exist in DB", async () => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const m of ["select", "order", "limit"]) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    chain.single = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "no rows" },
    });

    const mockDb = { from: vi.fn().mockReturnValue(chain) };
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await expect(refreshYouTubeToken()).rejects.toThrow(
      "No YouTube credentials found"
    );
  });
});
