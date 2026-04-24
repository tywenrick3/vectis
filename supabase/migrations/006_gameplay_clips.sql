-- Vectis: Gameplay Backgrounds — pre-fetched no-copyright gameplay clips for short-form backgrounds.
-- Discovered via channel-seeded YouTube search, downloaded via yt-dlp, normalized to 1080x1920 / 30fps / no audio, stored in R2.

create table gameplay_clips (
  id uuid primary key default uuid_generate_v4(),

  -- Which gameplay tag this clip belongs to (minecraft-parkour, subway-surfers).
  tag text not null,

  -- YouTube source metadata (frozen at ingest time).
  source_video_id text not null unique,
  source_url text not null,
  source_title text not null,
  source_channel text not null,
  source_published_at timestamptz not null,
  source_duration_sec integer not null,
  views_at_ingest bigint not null default 0,
  score numeric not null default 0,

  -- R2 storage.
  r2_key text not null,
  r2_url text not null,

  -- Normalized output spec.
  normalized_width integer not null default 1080,
  normalized_height integer not null default 1920,
  was_pre_vertical boolean not null default false,

  -- Pool lifecycle.
  fetched_at timestamptz not null default now(),
  last_used_at timestamptz,
  use_count integer not null default 0,
  retired boolean not null default false,
  notes text
);

-- Pool picking: filter by tag, non-retired, least-recently-used first.
create index idx_gameplay_clips_tag_active on gameplay_clips (tag, retired, last_used_at nulls first);
