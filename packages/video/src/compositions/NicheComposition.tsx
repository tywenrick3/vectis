import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import type { CompositionProps } from "./Root";
import { CaptionOverlay } from "./CaptionOverlay";
import {
  AnimatedGradient,
  ProgressBar,
  SegmentTransition,
  SegmentRenderer,
  type NicheTheme,
} from "./visuals";

interface NicheCompositionProps extends CompositionProps {
  theme: NicheTheme;
  disclaimer?: string;
}

export const NicheComposition: React.FC<NicheCompositionProps> = ({
  script,
  voiceAsset,
  captionWords,
  hookOverride,
  theme,
  disclaimer,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

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
      {/* Animated gradient background */}
      <AnimatedGradient colors={theme.gradientColors} />

      {/* Progress bar */}
      <ProgressBar color={theme.accentColor} />

      {/* Audio track */}
      {voiceAsset.audio_url && <Audio src={voiceAsset.audio_url} />}

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
            <SegmentTransition durationInFrames={segmentFrames}>
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
