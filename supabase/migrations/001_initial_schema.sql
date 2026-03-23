-- Vectis: Initial Schema
-- Run against Supabase hosted project

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Topics
create table topics (
  id uuid primary key default uuid_generate_v4(),
  niche text not null,
  title text not null,
  description text not null,
  score integer not null default 0,
  used boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_topics_niche_unused on topics (niche, used) where used = false;
create index idx_topics_score on topics (score desc);

-- Scripts
create table scripts (
  id uuid primary key default uuid_generate_v4(),
  topic_id uuid not null references topics(id) on delete cascade,
  hook text not null,
  body jsonb not null,
  cta text not null,
  full_text text not null,
  caption text not null default '',
  hashtags text[] not null default '{}',
  estimated_duration_ms integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_scripts_topic on scripts (topic_id);

-- Voice Assets
create table voice_assets (
  id uuid primary key default uuid_generate_v4(),
  script_id uuid not null references scripts(id) on delete cascade,
  audio_url text not null,
  duration_ms integer not null,
  cost numeric(10, 4) not null default 0,
  created_at timestamptz not null default now()
);

create index idx_voice_assets_script on voice_assets (script_id);

-- Videos
create table videos (
  id uuid primary key default uuid_generate_v4(),
  script_id uuid not null references scripts(id) on delete cascade,
  voice_asset_id uuid not null references voice_assets(id) on delete cascade,
  video_url text not null,
  duration_ms integer not null,
  file_size bigint not null default 0,
  composition_id text not null,
  created_at timestamptz not null default now()
);

create index idx_videos_script on videos (script_id);

-- Pipeline Runs
create type pipeline_status as enum (
  'pending', 'ideating', 'voicing', 'rendering', 'publishing', 'completed', 'failed'
);

create table pipeline_runs (
  id uuid primary key default uuid_generate_v4(),
  topic_id uuid references topics(id),
  script_id uuid references scripts(id),
  voice_asset_id uuid references voice_assets(id),
  video_id uuid references videos(id),
  tiktok_publish_id text,
  status pipeline_status not null default 'pending',
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index idx_pipeline_runs_status on pipeline_runs (status);
create index idx_pipeline_runs_completed on pipeline_runs (completed_at desc);

-- TikTok Credentials
create table tiktok_credentials (
  id uuid primary key default uuid_generate_v4(),
  access_token text not null,
  refresh_token text not null,
  access_token_expires_at timestamptz not null,
  refresh_token_expires_at timestamptz not null,
  open_id text not null unique,
  updated_at timestamptz not null default now()
);

-- Analytics Snapshots
create table analytics_snapshots (
  id uuid primary key default uuid_generate_v4(),
  pipeline_run_id uuid not null references pipeline_runs(id) on delete cascade,
  views integer not null default 0,
  likes integer not null default 0,
  comments integer not null default 0,
  shares integer not null default 0,
  avg_watch_time_ms integer not null default 0,
  fetched_at timestamptz not null default now()
);

create index idx_analytics_run on analytics_snapshots (pipeline_run_id);
create index idx_analytics_fetched on analytics_snapshots (fetched_at desc);

-- Auto-update updated_at trigger
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger topics_updated_at
  before update on topics
  for each row execute function update_updated_at();

create trigger tiktok_credentials_updated_at
  before update on tiktok_credentials
  for each row execute function update_updated_at();
