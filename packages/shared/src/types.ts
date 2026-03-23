export interface Topic {
  id: string;
  niche: string;
  title: string;
  description: string;
  score: number;
  used: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScriptSegment {
  narration: string;
  visual_cue: string;
  duration_estimate_ms: number;
}

export interface Script {
  id: string;
  topic_id: string;
  hook: string;
  body: ScriptSegment[];
  cta: string;
  full_text: string;
  caption: string;
  hashtags: string[];
  estimated_duration_ms: number;
  created_at: string;
}

export interface VoiceAsset {
  id: string;
  script_id: string;
  audio_url: string;
  duration_ms: number;
  cost: number;
  created_at: string;
}

export interface VideoAsset {
  id: string;
  script_id: string;
  voice_asset_id: string;
  video_url: string;
  duration_ms: number;
  file_size: number;
  composition_id: string;
  created_at: string;
}

export type PipelineStatus =
  | "pending"
  | "ideating"
  | "voicing"
  | "rendering"
  | "publishing"
  | "completed"
  | "failed";

export interface PipelineRun {
  id: string;
  topic_id: string | null;
  script_id: string | null;
  voice_asset_id: string | null;
  video_id: string | null;
  tiktok_publish_id: string | null;
  status: PipelineStatus;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface TikTokCredentials {
  id: string;
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string;
  refresh_token_expires_at: string;
  open_id: string;
  updated_at: string;
}

export interface AnalyticsSnapshot {
  id: string;
  pipeline_run_id: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  avg_watch_time_ms: number;
  fetched_at: string;
}
