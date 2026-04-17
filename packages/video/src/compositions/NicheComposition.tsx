import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import type { CompositionProps } from "./Root";
import { CaptionOverlay } from "./CaptionOverlay";
import {
  BackgroundFX,
  ProgressBar,
  SegmentTransition,
  SegmentRenderer,
  type NicheTheme,
} from "./visuals";

interface NicheCompositionProps extends CompositionProps {
  theme: NicheTheme;
  disclaimer?: string;
}

// Music bed fades in over 0.5s and out over 1s, holds at 15% between.
const MUSIC_BASE_VOLUME = 0.15;
const MUSIC_FADE_IN_FRAMES = 15;
const MUSIC_FADE_OUT_FRAMES = 30;

export const NicheComposition: React.FC<NicheCompositionProps> = ({
  script,
  voiceAsset,
  captionWords,
  hookOverride,
  musicTrack,
  theme,
  disclaimer,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const musicVolume = (f: number): number => {
    if (f < MUSIC_FADE_IN_FRAMES) {
      return (f / MUSIC_FADE_IN_FRAMES) * MUSIC_BASE_VOLUME;
    }
    const fadeOutStart = durationInFrames - MUSIC_FADE_OUT_FRAMES;
    if (f > fadeOutStart) {
      return Math.max(0, (durationInFrames - f) / MUSIC_FADE_OUT_FRAMES) * MUSIC_BASE_VOLUME;
    }
    return MUSIC_BASE_VOLUME;
  };

  const hookDurationFrames = 3 * fps;
  let currentFrame = hookDurationFrames;
  const hookText = hookOverride ?? script.hook;

  // Hook animations
  const hookOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });
  const hookScale = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 100, mass: 0.7 },
  });

  return (
    <AbsoluteFill style={{ fontFamily: theme.fontFamily }}>
      {/* Animated mesh-gradient background w/ grain + vignette */}
      <BackgroundFX theme={theme} />

      {/* Progress bar */}
      <ProgressBar color={theme.accentColor} />

      {/* Audio track */}
      {voiceAsset.audio_url && <Audio src={voiceAsset.audio_url} />}

      {/* Background music bed */}
      {musicTrack && <Audio src={staticFile(musicTrack)} volume={musicVolume} />}

      {/* Hook */}
      <Sequence durationInFrames={hookDurationFrames}>
        <SegmentTransition durationInFrames={hookDurationFrames}>
          <AbsoluteFill
            style={{
              justifyContent: "center",
              alignItems: "center",
              padding: 60,
            }}
          >
            <div
              style={{
                color: "#fff",
                fontSize: 60,
                fontWeight: 800,
                textAlign: "center",
                lineHeight: 1.3,
                maxWidth: 900,
                opacity: hookOpacity,
                transform: `scale(${interpolate(hookScale, [0, 1], [0.85, 1])})`,
              }}
            >
              {hookText}
            </div>
          </AbsoluteFill>
        </SegmentTransition>
      </Sequence>

      {/* Body segments */}
      {script.body?.map((segment, i) => {
        const segmentFrames = Math.ceil(
          (segment.duration_estimate_ms / 1000) * fps
        );
        const startFrame = currentFrame;
        currentFrame += segmentFrames;

        return (
          <Sequence
            key={i}
            from={startFrame}
            durationInFrames={segmentFrames}
          >
            <SegmentTransition
              durationInFrames={segmentFrames}
              style={segment.transition}
            >
              <SegmentRenderer
                visualCue={segment.visual_cue}
                narration={segment.narration}
                accentColor={theme.accentColor}
                durationInFrames={segmentFrames}
              />
            </SegmentTransition>
          </Sequence>
        );
      })}

      {/* CTA */}
      <Sequence from={currentFrame}>
        <SegmentTransition durationInFrames={fps * 3}>
          <AbsoluteFill
            style={{
              justifyContent: "center",
              alignItems: "center",
              padding: 60,
            }}
          >
            <div
              style={{
                color: theme.accentColor,
                fontSize: 54,
                fontWeight: 800,
                textAlign: "center",
                lineHeight: 1.3,
                maxWidth: 900,
              }}
            >
              {script.cta}
            </div>
            {disclaimer && (
              <div
                style={{
                  color: "#ffffff60",
                  fontSize: 22,
                  marginTop: 20,
                  textAlign: "center",
                }}
              >
                {disclaimer}
              </div>
            )}
          </AbsoluteFill>
        </SegmentTransition>
      </Sequence>

      {/* Captions */}
      {captionWords && captionWords.length > 0 && (
        <CaptionOverlay words={captionWords} style={theme.captionStyle} />
      )}
    </AbsoluteFill>
  );
};
