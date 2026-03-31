import { getEnv, getDb, createLogger, type YouTubeCredentials } from "@vectis/shared";

const log = createLogger("publisher:youtube:auth");

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

export function getAuthUrl(): string {
  const env = getEnv();
  const params = new URLSearchParams({
    client_id: env.YOUTUBE_CLIENT_ID,
    redirect_uri: env.YOUTUBE_REDIRECT_URI,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function handleYouTubeCallback(code: string): Promise<YouTubeCredentials> {
  const env = getEnv();
  const db = getDb();

  log.info("Exchanging auth code for tokens");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.YOUTUBE_CLIENT_ID,
      client_secret: env.YOUTUBE_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: env.YOUTUBE_REDIRECT_URI,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`YouTube token exchange failed: ${err}`);
  }

  const data = await response.json();
  const now = new Date();

  // Fetch channel ID
  const channelResponse = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=id&mine=true",
    { headers: { Authorization: `Bearer ${data.access_token}` } }
  );

  if (!channelResponse.ok) {
    throw new Error("Failed to fetch YouTube channel info");
  }

  const channelData = await channelResponse.json();
  const channelId = channelData.items?.[0]?.id;
  if (!channelId) throw new Error("No YouTube channel found for this account");

  const credentials = {
    channel_id: channelId,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    access_token_expires_at: new Date(
      now.getTime() + data.expires_in * 1000
    ).toISOString(),
  };

  const { data: row, error } = await db
    .from("youtube_credentials")
    .upsert(credentials, { onConflict: "channel_id" })
    .select()
    .single();

  if (error) throw new Error(`Failed to store credentials: ${error.message}`);

  log.info({ channelId }, "YouTube credentials stored");
  return row as YouTubeCredentials;
}

export async function refreshYouTubeToken(): Promise<YouTubeCredentials> {
  const env = getEnv();
  const db = getDb();

  const { data: creds, error } = await db
    .from("youtube_credentials")
    .select()
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !creds) throw new Error("No YouTube credentials found");

  const expiresAt = new Date(creds.access_token_expires_at);
  const buffer = 60 * 60 * 1000; // 1 hour buffer

  if (expiresAt.getTime() - Date.now() > buffer) {
    return creds as YouTubeCredentials;
  }

  log.info("Refreshing YouTube access token");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.YOUTUBE_CLIENT_ID,
      client_secret: env.YOUTUBE_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: creds.refresh_token,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`YouTube token refresh failed: ${err}`);
  }

  const data = await response.json();
  const now = new Date();

  const { data: updated, error: updateError } = await db
    .from("youtube_credentials")
    .update({
      access_token: data.access_token,
      access_token_expires_at: new Date(
        now.getTime() + data.expires_in * 1000
      ).toISOString(),
    })
    .eq("channel_id", creds.channel_id)
    .select()
    .single();

  if (updateError) throw new Error(`Failed to update tokens: ${updateError.message}`);

  log.info("YouTube token refreshed");
  return updated as YouTubeCredentials;
}
