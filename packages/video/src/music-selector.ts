/**
 * Registry of background music tracks available per niche. Paths are relative
 * to packages/video/public/ and resolved at render time via Remotion's
 * staticFile() in the composition layer.
 *
 * Selection is deterministic on scriptId so (a) re-renders pick the same
 * track and (b) hook variants of the same script share a track — the A/B
 * isolates the hook, not the music.
 */
const MUSIC_TRACKS: Record<string, string[]> = {
  "tech-explainer": [
    "music/tech-explainer/analytical-focus.mp3",
    "music/tech-explainer/forward-motion.mp3",
    "music/tech-explainer/tense-reveal.mp3",
  ],
};

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function selectMusicTrack(
  scriptId: string,
  niche: string
): string | null {
  const tracks = MUSIC_TRACKS[niche];
  if (!tracks || tracks.length === 0) return null;
  const idx = hashString(scriptId) % tracks.length;
  return tracks[idx];
}

export function getAvailableTracks(niche: string): string[] {
  return MUSIC_TRACKS[niche] ?? [];
}
