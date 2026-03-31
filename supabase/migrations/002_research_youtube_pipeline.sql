-- Vectis: Research Briefs, YouTube Credentials, Pipeline Stage Logs
-- Adds tables for research layer, YouTube publishing, and pipeline observability

-- Research Briefs
create table research_briefs (
  id uuid primary key default uuid_generate_v4(),
  niche text not null,
  trending_topics jsonb not null default '[]',
  recent_news jsonb not null default '[]',
  competitor_angles jsonb not null default '[]',
  saturation_signals jsonb not null default '[]',
  source_material jsonb not null default '[]',
  searched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index idx_research_briefs_niche on research_briefs (niche);
create index idx_research_briefs_searched on research_briefs (searched_at desc);

-- YouTube Credentials
create table youtube_credentials (
  id uuid primary key default uuid_generate_v4(),
  channel_id text not null unique,
  access_token text not null,
  refresh_token text not null,
  access_token_expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create trigger youtube_credentials_updated_at
  before update on youtube_credentials
  for each row execute function update_updated_at();

-- Add YouTube + Research columns to pipeline_runs
alter table pipeline_runs
  add column if not exists niche text,
  add column if not exists youtube_publish_id text,
  add column if not exists research_brief_id uuid references research_briefs(id);

create index idx_pipeline_runs_niche on pipeline_runs (niche);

-- Pipeline Stage Logs (granular observability)
create table pipeline_stage_logs (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null references pipeline_runs(id) on delete cascade,
  stage text not null,
  status text not null default 'started',
  input jsonb,
  output jsonb,
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index idx_stage_logs_run on pipeline_stage_logs (run_id);
create index idx_stage_logs_stage on pipeline_stage_logs (stage, status);
