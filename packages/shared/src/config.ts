import { z } from "zod";

const envSchema = z.object({
  // API
  API_PORT: z.coerce.number().default(3000),
  API_KEY: z.string().min(1),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Anthropic
  ANTHROPIC_API_KEY: z.string().min(1),

  // ElevenLabs
  ELEVENLABS_API_KEY: z.string().min(1),
  ELEVENLABS_VOICE_ID: z.string().min(1),

  // Cloudflare R2
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET_NAME: z.string().default("vectis"),
  R2_PUBLIC_URL: z.string().url(),

  // TikTok (optional — not needed for YouTube-only pipeline)
  TIKTOK_CLIENT_KEY: z.string().min(1).optional(),
  TIKTOK_CLIENT_SECRET: z.string().min(1).optional(),
  TIKTOK_REDIRECT_URI: z.string().url().optional(),

  // YouTube
  YOUTUBE_CLIENT_ID: z.string().min(1),
  YOUTUBE_CLIENT_SECRET: z.string().min(1),
  YOUTUBE_REDIRECT_URI: z.string().url(),

  // Tavily
  TAVILY_API_KEY: z.string().min(1),

  // Firecrawl
  FIRECRAWL_API_KEY: z.string().min(1),

  // OpenAI (Whisper transcription)
  OPENAI_API_KEY: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (!_env) {
    _env = envSchema.parse(process.env);
  }
  return _env;
}
