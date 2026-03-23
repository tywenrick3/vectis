import { Hono } from "hono";
import { getEnv, createLogger } from "@vectis/shared";
import { handleTikTokCallback } from "@vectis/publisher";

const log = createLogger("route:oauth");

export const oauthRoute = new Hono();

// TikTok OAuth callback
oauthRoute.get("/tiktok/callback", async (c) => {
  const code = c.req.query("code");
  const error = c.req.query("error");

  if (error) {
    log.error({ error }, "TikTok OAuth error");
    return c.json({ error: `OAuth error: ${error}` }, 400);
  }

  if (!code) {
    return c.json({ error: "Missing authorization code" }, 400);
  }

  try {
    const credentials = await handleTikTokCallback(code);
    log.info({ openId: credentials.open_id }, "TikTok OAuth complete");
    return c.json({ status: "ok", open_id: credentials.open_id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ error: message }, "TikTok OAuth callback failed");
    return c.json({ error: message }, 500);
  }
});

// TikTok OAuth initiation (redirect to TikTok)
oauthRoute.get("/tiktok", (c) => {
  const env = getEnv();
  const params = new URLSearchParams({
    client_key: env.TIKTOK_CLIENT_KEY,
    redirect_uri: env.TIKTOK_REDIRECT_URI,
    response_type: "code",
    scope: "user.info.basic,video.publish,video.upload",
  });

  return c.redirect(
    `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`
  );
});
