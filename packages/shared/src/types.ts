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

// --- Visual Cue Types (data-driven visualizations) ---

export interface AnimatedCounterCue {
  type: "animated_counter";
  value: number;
  prefix?: string;
  suffix?: string;
  label: string;
}

export interface BarChartCue {
  type: "bar_chart";
  title: string;
  bars: { label: string; value: number; color?: string }[];
  unit?: string;
}

export interface ComparisonCardCue {
  type: "comparison";
  left: { name: string; specs: { label: string; value: string }[] };
  right: { name: string; specs: { label: string; value: string }[] };
}

export interface StatCalloutCue {
  type: "stat_callout";
  value: string;
  label: string;
  direction?: "up" | "down" | "neutral";
}

export interface ListRevealCue {
  type: "list_reveal";
  title?: string;
  items: string[];
}

export interface TextSlideCue {
  type: "text_slide";
  text: string;
}

export type VisualCue =
  | AnimatedCounterCue
  | BarChartCue
  | ComparisonCardCue
  | StatCalloutCue
  | ListRevealCue
  | TextSlideCue;

export function isStructuredCue(cue: string | VisualCue): cue is VisualCue {
  return typeof cue === "object" && cue !== null && "type" in cue;
}

// --- Script ---

export interface ScriptSegment {
  narration: string;
  visual_cue: string | VisualCue;
  duration_estimate_ms: number;
}

export interface Script {
  id: string;
  topic_id: string;
  hook: string;
  hook_variants: string[];
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
  | "assembling"
  | "publishing"
  | "completed"
  | "failed";

export interface PipelineRun {
  id: string;
  niche: string | null;
  topic_id: string | null;
  script_id: string | null;
  voice_asset_id: string | null;
  video_id: string | null;
  tiktok_publish_id: string | null;
  youtube_publish_id: string | null;
  research_brief_id: string | null;
  assembly_job_ids: string[] | null;
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

// YouTube

export interface YouTubeCredentials {
  id: string;
  channel_id: string;
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string;
  updated_at: string;
}

// Research

export interface TrendingTopic {
  title: string;
  source: string;
  velocity: number;
  freshness: string;
}

export interface NewsItem {
  headline: string;
  summary: string;
  url: string;
  published_at: string;
}

export interface SourceItem {
  fact: string;
  source_url: string;
  type: "stat" | "quote" | "data_point";
}

export interface ResearchBrief {
  id: string;
  niche: string;
  trending_topics: TrendingTopic[];
  recent_news: NewsItem[];
  competitor_angles: string[];
  saturation_signals: string[];
  source_material: SourceItem[];
  searched_at: string;
}

// Pipeline Stage Logs

export type PipelineStage =
  | "research"
  | "ideation"
  | "voice"
  | "render"
  | "assembly"
  | "publish"
  | "analytics";

export interface PipelineStageLog {
  id: string;
  run_id: string;
  stage: PipelineStage;
  status: "started" | "completed" | "failed";
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  started_at: string;
  completed_at: string | null;
  error: string | null;
}

// Assembly

export interface TranscriptionWord {
  word: string;
  start_ms: number;
  end_ms: number;
}

export interface Transcription {
  id: string;
  voice_asset_id: string;
  words: TranscriptionWord[];
  full_text: string;
  duration_ms: number;
  cost: number;
  created_at: string;
}

export type OutputFormat = "9:16" | "16:9" | "1:1";

export interface AssemblyOutput {
  id: string;
  assembly_job_id: string;
  format: OutputFormat;
  output_url: string;
  width: number;
  height: number;
  file_size: number;
  created_at: string;
}

export type AssemblyJobStatus =
  | "pending"
  | "transcribing"
  | "rendering"
  | "formatting"
  | "completed"
  | "failed";

export interface AssemblyJob {
  id: string;
  script_id: string;
  video_id: string;
  voice_asset_id: string;
  transcription_id: string;
  hook_variant_index: number;
  hook_text: string;
  composition_id: string;
  outputs: AssemblyOutput[];
  status: AssemblyJobStatus;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}
