-- Vectis: Gameplay Clips — clip_duration_sec tracks the actual stored file length (windowed).
-- source_duration_sec is the original YouTube video length; the stored file may be a windowed slice of it.
-- pickClip compares desired playback duration against clip_duration_sec.

alter table gameplay_clips
  add column if not exists clip_duration_sec integer not null default 180;

-- Backfill any pre-windowing rows with source length as their clip length.
-- Safe to re-run: only touches rows where defaults don't reflect reality.
update gameplay_clips
  set clip_duration_sec = source_duration_sec
  where source_duration_sec < 200 and clip_duration_sec = 180;
