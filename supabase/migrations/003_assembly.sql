-- Vectis: Assembly Layer — transcriptions, assembly jobs, multi-format outputs
-- Adds Whisper transcription storage, assembly orchestration, and A/B hook variant support

-- Add hook_variants to scripts for A/B testing
alter table scripts
  add column if not exists hook_variants text[] not null default '{}';

-- Transcriptions (Whisper word-level timestamps)
create table transcriptions (
  id uuid primary key default uuid_generate_v4(),
  voice_asset_id uuid not null references voice_assets(id) on delete cascade,
  words jsonb not null default '[]',
  full_text text not null default '',
  duration_ms integer not null default 0,
  cost numeric(10, 6) not null default 0,
  created_at timestamptz not null default now()
);

-- One transcription per voice asset (dedup across hook variants)
create unique index idx_transcriptions_voice on transcriptions (voice_asset_id);

-- Assembly Jobs (one per hook variant)
create table assembly_jobs (
  id uuid primary key default uuid_generate_v4(),
  script_id uuid not null references scripts(id) on delete cascade,
  video_id uuid not null references videos(id) on delete cascade,
  voice_asset_id uuid not null references voice_assets(id) on delete cascade,
  transcription_id uuid not null references transcriptions(id) on delete cascade,
  hook_variant_index integer not null default 0,
  hook_text text not null,
  composition_id text not null,
  status text not null default 'pending',
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index idx_assembly_jobs_script on assembly_jobs (script_id);
create index idx_assembly_jobs_status on assembly_jobs (status);

-- Assembly Outputs (one per format per job)
create table assembly_outputs (
  id uuid primary key default uuid_generate_v4(),
  assembly_job_id uuid not null references assembly_jobs(id) on delete cascade,
  format text not null,
  output_url text not null,
  width integer not null,
  height integer not null,
  file_size bigint not null default 0,
  created_at timestamptz not null default now()
);

create index idx_assembly_outputs_job on assembly_outputs (assembly_job_id);
create unique index idx_assembly_outputs_job_format on assembly_outputs (assembly_job_id, format);

-- Add assembly tracking to pipeline_runs
alter table pipeline_runs
  add column if not exists assembly_job_ids uuid[] default '{}';

-- Add 'assembling' status to pipeline
alter type pipeline_status add value if not exists 'assembling' after 'rendering';
