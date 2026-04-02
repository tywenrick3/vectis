-- Allow URL columns to be nulled when R2 files are cleaned up.
-- Rows are kept for analytics history; null URL = files purged.

ALTER TABLE voice_assets ALTER COLUMN audio_url DROP NOT NULL;
ALTER TABLE videos ALTER COLUMN video_url DROP NOT NULL;
ALTER TABLE assembly_outputs ALTER COLUMN output_url DROP NOT NULL;
