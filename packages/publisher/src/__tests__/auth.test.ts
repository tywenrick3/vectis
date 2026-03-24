import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@vectis/shared", () => ({
  getEnv: vi.fn(() => ({
    TIKTOK_CLIENT_KEY: "test-client-key",
    TIKTOK_CLIENT_SECRET: "test-client-secret",
    TIKTOK_REDIRECT_URI: "https://example.com/callback",
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
  handleTikTokCallback,
  refreshTokenIfNeeded,
} from "../tiktok/auth.js";

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

// ── handleTikTokCallback ─────────────────────────────────────────────────────

describe("handleTikTokCallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exchanges auth code and stores credentials", async () => {
    const tokenData = {
      access_token: "access-123",
      refresh_token: "refresh-456",
      expires_in: 86400, // 24 hours
      refresh_expires_in: 2592000, // 30 days
      open_id: "user-789",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(tokenData),
      })
    );

    const storedRow = {
      id: "cred-1",
      access_token: "access-123",
      refresh_token: "refresh-456",
      access_token_expires_at: new Date(
        Date.now() + 86400 * 1000
      ).toISOString(),
      refresh_token_expires_at: new Date(
        Date.now() + 2592000 * 1000
      ).toISOString(),
      open_id: "user-789",
      updated_at: "2025-06-01T12:00:00Z",
    };

    const mockDb = createMockDb({
      tiktok_credentials: { data: storedRow, error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    const result = await handleTikTokCallback("auth-code-xyz");

    // Verify fetch was called with correct params
    expect(fetch).toHaveBeenCalledWith(
      "https://open.tiktokapis.com/v2/oauth/token/",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      })
    );

    // Verify the body contains the auth code and credentials
    const fetchCall = vi.mocked(fetch).mock.calls[0];
    const body = fetchCall[1]!.body as URLSearchParams;
    expect(body.get("code")).toBe("auth-code-xyz");
    expect(body.get("client_key")).toBe("test-client-key");
    expect(body.get("client_secret")).toBe("test-client-secret");
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("redirect_uri")).toBe("https://example.com/callback");

    // Verify upsert was called on tiktok_credentials table
    expect(mockDb.from).toHaveBeenCalledWith("tiktok_credentials");

    expect(result.open_id).toBe("user-789");
    expect(result.access_token).toBe("access-123");
  });

  it("calculates token expiry dates correctly", async () => {
    const now = new Date("2025-06-01T12:00:00Z");
    const expiresIn = 86400; // 24 hours
    const refreshExpiresIn = 2592000; // 30 days

    const tokenData = {
      access_token: "access-123",
      refresh_token: "refresh-456",
      expires_in: expiresIn,
      refresh_expires_in: refreshExpiresIn,
      open_id: "user-789",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(tokenData),
      })
    );

    const mockDb = createMockDb({
      tiktok_credentials: { data: { id: "cred-1", open_id: "user-789" }, error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await handleTikTokCallback("auth-code");

    const upsertCall = mockDb.from("tiktok_credentials")
      .upsert as ReturnType<typeof vi.fn>;
    const upsertArg = upsertCall.mock.calls[0][0];

    const expectedAccessExpiry = new Date(
      now.getTime() + expiresIn * 1000
    ).toISOString();
    const expectedRefreshExpiry = new Date(
      now.getTime() + refreshExpiresIn * 1000
    ).toISOString();

    expect(upsertArg.access_token_expires_at).toBe(expectedAccessExpiry);
    expect(upsertArg.refresh_token_expires_at).toBe(expectedRefreshExpiry);
  });

  it("throws on failed token exchange (non-ok response)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        text: vi.fn().mockResolvedValue("invalid_grant"),
      })
    );

    const mockDb = createMockDb({
      tiktok_credentials: { data: null, error: null },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await expect(handleTikTokCallback("bad-code")).rejects.toThrow(
      "TikTok token exchange failed: invalid_grant"
    );
  });

  it("throws on DB upsert error", async () => {
    const tokenData = {
      access_token: "access-123",
      refresh_token: "refresh-456",
      expires_in: 86400,
      refresh_expires_in: 2592000,
      open_id: "user-789",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(tokenData),
      })
    );

    const mockDb = createMockDb({
      tiktok_credentials: {
        data: null,
        error: { message: "unique constraint violated" },
      },
    });
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await expect(handleTikTokCallback("auth-code")).rejects.toThrow(
      "Failed to store credentials: unique constraint violated"
    );
  });
});

// ── refreshTokenIfNeeded ─────────────────────────────────────────────────────

describe("refreshTokenIfNeeded", () => {
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
    // Token expires in 3 hours (well beyond 1-hour buffer)
    const threeHoursFromNow = new Date(
      Date.now() + 3 * 60 * 60 * 1000
    ).toISOString();

    const existingCreds = {
      id: "cred-1",
      access_token: "access-still-valid",
      refresh_token: "refresh-456",
      access_token_expires_at: threeHoursFromNow,
      refresh_token_expires_at: "2025-07-01T12:00:00Z",
      open_id: "user-789",
      updated_at: "2025-06-01T10:00:00Z",
    };

    // For refreshTokenIfNeeded, the DB chain is: from().select().order().limit().single()
    // We need to make sure the chain supports order and limit before single
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    const methods = ["select", "order", "limit", "update", "eq"];
    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    chain.single = vi.fn().mockResolvedValue({
      data: existingCreds,
      error: null,
    });

    const mockDb = {
      from: vi.fn().mockReturnValue(chain),
    };
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    const result = await refreshTokenIfNeeded();

    expect(result.access_token).toBe("access-still-valid");
    // fetch should NOT have been called since token is still valid
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refreshes token when within 1-hour buffer of expiry", async () => {
    // Token expires in 30 minutes (within 1-hour buffer)
    const thirtyMinutesFromNow = new Date(
      Date.now() + 30 * 60 * 1000
    ).toISOString();

    const existingCreds = {
      id: "cred-1",
      access_token: "access-expiring",
      refresh_token: "refresh-456",
      access_token_expires_at: thirtyMinutesFromNow,
      refresh_token_expires_at: "2025-07-01T12:00:00Z",
      open_id: "user-789",
      updated_at: "2025-06-01T10:00:00Z",
    };

    const refreshedTokenData = {
      access_token: "access-new",
      refresh_token: "refresh-new",
      expires_in: 86400,
      refresh_expires_in: 2592000,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(refreshedTokenData),
      })
    );

    const updatedRow = {
      id: "cred-1",
      access_token: "access-new",
      refresh_token: "refresh-new",
      access_token_expires_at: new Date(
        Date.now() + 86400 * 1000
      ).toISOString(),
      refresh_token_expires_at: new Date(
        Date.now() + 2592000 * 1000
      ).toISOString(),
      open_id: "user-789",
      updated_at: "2025-06-01T12:00:00Z",
    };

    // Build two separate chains: one for the initial select, one for the update
    let callCount = 0;
    const mockDb = {
      from: vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          // First call: select chain -> from().select().order().limit().single()
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
          // Second call: update chain -> from().update().eq().select().single()
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

    const result = await refreshTokenIfNeeded();

    // Verify the refresh fetch was called
    expect(fetch).toHaveBeenCalledWith(
      "https://open.tiktokapis.com/v2/oauth/token/",
      expect.objectContaining({
        method: "POST",
      })
    );

    // Verify the body uses refresh_token grant type
    const fetchCall = vi.mocked(fetch).mock.calls[0];
    const body = fetchCall[1]!.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("refresh-456");

    expect(result.access_token).toBe("access-new");
    expect(result.refresh_token).toBe("refresh-new");
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

    const mockDb = {
      from: vi.fn().mockReturnValue(chain),
    };
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await expect(refreshTokenIfNeeded()).rejects.toThrow(
      "No TikTok credentials found"
    );
  });

  it("updates both access and refresh tokens on refresh", async () => {
    // Token expiring in 10 minutes
    const tenMinutesFromNow = new Date(
      Date.now() + 10 * 60 * 1000
    ).toISOString();

    const existingCreds = {
      id: "cred-1",
      access_token: "access-old",
      refresh_token: "refresh-old",
      access_token_expires_at: tenMinutesFromNow,
      refresh_token_expires_at: "2025-07-01T12:00:00Z",
      open_id: "user-789",
      updated_at: "2025-06-01T10:00:00Z",
    };

    const refreshedTokenData = {
      access_token: "access-brand-new",
      refresh_token: "refresh-brand-new",
      expires_in: 86400,
      refresh_expires_in: 2592000,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(refreshedTokenData),
      })
    );

    let updatePayload: Record<string, unknown> | null = null;
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
          updateChain.update = vi.fn((payload: Record<string, unknown>) => {
            updatePayload = payload;
            return updateChain;
          });
          updateChain.eq = vi.fn().mockReturnValue(updateChain);
          updateChain.select = vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                ...existingCreds,
                access_token: "access-brand-new",
                refresh_token: "refresh-brand-new",
              },
              error: null,
            }),
          });
          return updateChain;
        }
      }),
    };
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    await refreshTokenIfNeeded();

    // Verify both tokens were updated
    expect(updatePayload).not.toBeNull();
    expect(updatePayload!.access_token).toBe("access-brand-new");
    expect(updatePayload!.refresh_token).toBe("refresh-brand-new");
    // Verify expiry dates were also updated
    expect(updatePayload!.access_token_expires_at).toBeDefined();
    expect(updatePayload!.refresh_token_expires_at).toBeDefined();
  });
});
