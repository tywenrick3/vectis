import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const validEnv: Record<string, string> = {
  API_PORT: "4000",
  API_KEY: "test-api-key",
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-supabase-role-key",
  ANTHROPIC_API_KEY: "test-anthropic-key",
  ELEVENLABS_API_KEY: "test-elevenlabs-key",
  ELEVENLABS_VOICE_ID: "test-voice-id",
  R2_ACCOUNT_ID: "test-r2-account",
  R2_ACCESS_KEY_ID: "test-r2-access-key",
  R2_SECRET_ACCESS_KEY: "test-r2-secret-key",
  R2_BUCKET_NAME: "test-bucket",
  R2_PUBLIC_URL: "https://r2.example.com",
  TIKTOK_CLIENT_KEY: "test-tiktok-key",
  TIKTOK_CLIENT_SECRET: "test-tiktok-secret",
  TIKTOK_REDIRECT_URI: "https://redirect.example.com/callback",
};

describe("config", () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  async function loadGetEnv(envOverrides: Record<string, string> = {}) {
    process.env = { ...envOverrides };
    const mod = await import("../config.js");
    return mod.getEnv;
  }

  it("parses valid env vars correctly", async () => {
    const getEnv = await loadGetEnv(validEnv);
    const env = getEnv();

    expect(env.API_PORT).toBe(4000);
    expect(env.API_KEY).toBe("test-api-key");
    expect(env.SUPABASE_URL).toBe("https://test.supabase.co");
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe("test-supabase-role-key");
    expect(env.ANTHROPIC_API_KEY).toBe("test-anthropic-key");
    expect(env.ELEVENLABS_API_KEY).toBe("test-elevenlabs-key");
    expect(env.ELEVENLABS_VOICE_ID).toBe("test-voice-id");
    expect(env.R2_ACCOUNT_ID).toBe("test-r2-account");
    expect(env.R2_ACCESS_KEY_ID).toBe("test-r2-access-key");
    expect(env.R2_SECRET_ACCESS_KEY).toBe("test-r2-secret-key");
    expect(env.R2_BUCKET_NAME).toBe("test-bucket");
    expect(env.R2_PUBLIC_URL).toBe("https://r2.example.com");
    expect(env.TIKTOK_CLIENT_KEY).toBe("test-tiktok-key");
    expect(env.TIKTOK_CLIENT_SECRET).toBe("test-tiktok-secret");
    expect(env.TIKTOK_REDIRECT_URI).toBe("https://redirect.example.com/callback");
  });

  it("applies default API_PORT of 3000 when not set", async () => {
    const { API_PORT: _, ...envWithoutPort } = validEnv;
    const getEnv = await loadGetEnv(envWithoutPort);
    const env = getEnv();

    expect(env.API_PORT).toBe(3000);
  });

  it("coerces string API_PORT to number", async () => {
    const getEnv = await loadGetEnv({ ...validEnv, API_PORT: "8080" });
    const env = getEnv();

    expect(env.API_PORT).toBe(8080);
    expect(typeof env.API_PORT).toBe("number");
  });

  it('applies default R2_BUCKET_NAME of "vectis"', async () => {
    const { R2_BUCKET_NAME: _, ...envWithoutBucket } = validEnv;
    const getEnv = await loadGetEnv(envWithoutBucket);
    const env = getEnv();

    expect(env.R2_BUCKET_NAME).toBe("vectis");
  });

  it("throws on missing required var API_KEY", async () => {
    const { API_KEY: _, ...envWithout } = validEnv;
    const getEnv = await loadGetEnv(envWithout);

    expect(() => getEnv()).toThrow();
  });

  it("throws on missing required var SUPABASE_URL", async () => {
    const { SUPABASE_URL: _, ...envWithout } = validEnv;
    const getEnv = await loadGetEnv(envWithout);

    expect(() => getEnv()).toThrow();
  });

  it("throws on missing required var ANTHROPIC_API_KEY", async () => {
    const { ANTHROPIC_API_KEY: _, ...envWithout } = validEnv;
    const getEnv = await loadGetEnv(envWithout);

    expect(() => getEnv()).toThrow();
  });

  it("throws on missing required var ELEVENLABS_API_KEY", async () => {
    const { ELEVENLABS_API_KEY: _, ...envWithout } = validEnv;
    const getEnv = await loadGetEnv(envWithout);

    expect(() => getEnv()).toThrow();
  });

  it("throws on invalid URL format for SUPABASE_URL", async () => {
    const getEnv = await loadGetEnv({ ...validEnv, SUPABASE_URL: "not-a-url" });

    expect(() => getEnv()).toThrow();
  });

  it("caches result on subsequent calls", async () => {
    const getEnv = await loadGetEnv(validEnv);

    const first = getEnv();
    const second = getEnv();

    expect(first).toBe(second);
  });
});
