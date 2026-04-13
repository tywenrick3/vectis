-- Vectis: Analytics v2
-- Retention-weighted scoring, hook attribution, per-platform scores, script-craft features.
-- Safe to run on an existing DB; uses `if not exists` / `add column if not exists` throughout.

-- ---------------------------------------------------------------------------
-- 1. Retention + platform on analytics_snapshots
-- ---------------------------------------------------------------------------
alter table analytics_snapshots
  add column if not exists platform text,
  add column if not exists script_duration_ms integer,
  add column if not exists completion_rate numeric(5, 4),
  add column if not exists avg_view_percentage numeric(5, 4);

create index if not exists idx_analytics_platform
  on analytics_snapshots (platform, fetched_at desc);

-- ---------------------------------------------------------------------------
-- 2. Hook attribution on pipeline_runs
-- (MVP: one publish per run, so we track which variant shipped directly on the run)
-- ---------------------------------------------------------------------------
alter table pipeline_runs
  add column if not exists hook_variant_index integer not null default 0,
  add column if not exists hook_text text,
  add column if not exists hook_format text;

create index if not exists idx_pipeline_runs_hook_format
  on pipeline_runs (hook_format);

-- ---------------------------------------------------------------------------
-- 3. Per-platform topic scores
-- topics.score is kept as a rollup (max across platforms) for backward compat.
-- ---------------------------------------------------------------------------
create table if not exists topic_platform_scores (
  topic_id uuid not null references topics(id) on delete cascade,
  platform text not null,
  score integer not null default 0,
  sample_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (topic_id, platform)
);

create index if not exists idx_topic_platform_scores_platform_score
  on topic_platform_scores (platform, score desc);

create trigger topic_platform_scores_updated_at
  before update on topic_platform_scores
  for each row execute function update_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Script-craft features
-- Populated by extractScriptFeatures() at submit_content time + one-time backfill.
-- ---------------------------------------------------------------------------
create table if not exists script_features (
  script_id uuid primary key references scripts(id) on delete cascade,
  hook_format text,
  segment_count integer not null,
  word_count integer not null,
  avg_segment_words numeric(5, 1),
  visual_cue_types text[] not null default '{}',
  visual_cue_variety integer not null default 0,
  transition_variety integer not null default 0,
  specificity_density numeric(5, 2),
  has_number_in_hook boolean not null default false,
  estimated_duration_ms integer not null default 0,
  extracted_at timestamptz not null default now()
);

create index if not exists idx_script_features_hook_format
  on script_features (hook_format);

-- ---------------------------------------------------------------------------
-- 5. Backfill: derive platform on existing analytics_snapshots
-- Rows published to both platforms will be bucketed by whichever id exists;
-- if both exist we default to 'tiktok' (historical snapshots predate YT ingest).
-- ---------------------------------------------------------------------------
update analytics_snapshots s
set platform = case
  when exists (
    select 1 from pipeline_runs r
    where r.id = s.pipeline_run_id and r.tiktok_publish_id is not null
  ) then 'tiktok'
  when exists (
    select 1 from pipeline_runs r
    where r.id = s.pipeline_run_id and r.youtube_publish_id is not null
  ) then 'youtube'
  else null
end
where platform is null;
