import { getEnv, getDb, createLogger, type TikTokCredentials } from "@vectis/shared";

const log = createLogger("publisher:tiktok:auth");

export async function handleTikTokCallback(code: string): Promise<TikTokCredentials> {
  const env = getEnv();
  const db = getDb();

  log.info("Exchanging auth code for tokens");

  const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: env.TIKTOK_CLIENT_KEY,
      client_secret: env.TIKTOK_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: env.TIKTOK_REDIRECT_URI,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`TikTok token exchange failed: ${err}`);
  }

  const data = await response.json();
  const now = new Date();

  const credentials = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    access_token_expires_at: new Date(
      now.getTime() + data.expires_in * 1000
    ).toISOString(),
    refresh_token_expires_at: new Date(
      now.getTime() + data.refresh_expires_in * 1000
    ).toISOString(),
    open_id: data.open_id,
  };

  const { data: row, error } = await db
    .from("tiktok_credentials")
    .upsert(credentials, { onConflict: "open_id" })
    .select()
    .single();

  if (error) throw new Error(`Failed to store credentials: ${error.message}`);

  log.info({ openId: row.open_id }, "TikTok credentials stored");
  return row as TikTokCredentials;
}

export async function refreshTokenIfNeeded(): Promise<TikTokCredentials> {
  const env = getEnv();
  const db = getDb();

  const { data: creds, error } = await db
    .from("tiktok_credentials")
    .select()
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !creds) throw new Error("No TikTok credentials found");

  const expiresAt = new Date(creds.access_token_expires_at);
  const buffer = 60 * 60 * 1000; // 1 hour buffer

  if (expiresAt.getTime() - Date.now() > buffer) {
    return creds as TikTokCredentials;
  }

  log.info("Refreshing TikTok access token");

  const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: env.TIKTOK_CLIENT_KEY,
      client_secret: env.TIKTOK_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: creds.refresh_token,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`TikTok token refresh failed: ${err}`);
  }

  const data = await response.json();
  const now = new Date();

  const { data: updated, error: updateError } = await db
    .from("tiktok_credentials")
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      access_token_expires_at: new Date(
        now.getTime() + data.expires_in * 1000
      ).toISOString(),
      refresh_token_expires_at: new Date(
        now.getTime() + data.refresh_expires_in * 1000
      ).toISOString(),
    })
    .eq("open_id", creds.open_id)
    .select()
    .single();

  if (updateError) throw new Error(`Failed to update tokens: ${updateError.message}`);

  log.info("Token refreshed");
  return updated as TikTokCredentials;
}
