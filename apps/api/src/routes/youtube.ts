import { Hono } from "hono";
import { getDb, createLogger } from "@vectis/shared";
import { getYouTubeAuthUrl, handleYouTubeCallback, refreshYouTubeToken } from "@vectis/publisher";

const log = createLogger("route:youtube");

export const youtubeRoute = new Hono();

// Redirect to Google OAuth consent screen
youtubeRoute.get("/auth", (c) => {
  return c.redirect(getYouTubeAuthUrl());
});

// Handle OAuth callback
youtubeRoute.get("/callback", async (c) => {
  const code = c.req.query("code");
  const error = c.req.query("error");

  if (error) {
    log.error({ error }, "YouTube OAuth error");
    return c.json({ error: `OAuth error: ${error}` }, 400);
  }

  if (!code) {
    return c.json({ error: "Missing authorization code" }, 400);
  }

  try {
    const credentials = await handleYouTubeCallback(code);
    log.info({ channelId: credentials.channel_id }, "YouTube OAuth complete");
    return c.json({ status: "ok", channel_id: credentials.channel_id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ error: message }, "YouTube OAuth callback failed");
    return c.json({ error: message }, 500);
  }
});

// Refresh tokens
youtubeRoute.post("/refresh", async (c) => {
  try {
    const credentials = await refreshYouTubeToken();
    log.info({ channelId: credentials.channel_id }, "YouTube token refreshed");
    return c.json({ status: "ok", channel_id: credentials.channel_id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ error: message }, "YouTube token refresh failed");
    return c.json({ error: message }, 500);
  }
});

// Check YouTube connection status
youtubeRoute.get("/status", async (c) => {
  const db = getDb();

  const { data: creds } = await db
    .from("youtube_credentials")
    .select("channel_id, access_token_expires_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  if (!creds) {
    return c.json({ connected: false });
  }

  const expiresAt = new Date(creds.access_token_expires_at);
  const isValid = expiresAt.getTime() > Date.now();

  return c.json({
    connected: true,
    channel_id: creds.channel_id,
    token_valid: isValid,
    expires_at: creds.access_token_expires_at,
  });
});
