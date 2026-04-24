import React from "react";
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
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

const TEXT_SHADOW_STRONG =
  "0 2px 6px rgba(0, 0, 0, 0.95), 0 6px 24px rgba(0, 0, 0, 0.75)";

export const NicheComposition: React.FC<NicheCompositionProps> = ({
  script,
  voiceAsset,
  captionWords,
  hookOverride,
  theme,
  disclaimer,
  backgroundClip,
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
      {backgroundClip ? (
        <>
          <AbsoluteFill>
            <OffthreadVideo
              src={backgroundClip.url}
              startFrom={Math.round(backgroundClip.startSec * fps)}
              muted
            />
          </AbsoluteFill>
          {/* Top gradient band — protects progress bar + frames the panel chip */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 100,
              background:
                "linear-gradient(to bottom, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0) 100%)",
              pointerEvents: "none",
            }}
          />
          {/* Bottom gradient band — protects caption zone */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 560,
              background:
                "linear-gradient(to top, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.25) 50%, rgba(0, 0, 0, 0) 100%)",
              pointerEvents: "none",
            }}
          />
        </>
      ) : (
        /* Fallback: mesh-gradient + grain + vignette when no gameplay clip available */
        <BackgroundFX theme={theme} />
      )}

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
                fontSize: 66,
                fontWeight: 900,
                textAlign: "center",
                lineHeight: 1.25,
                maxWidth: 920,
                opacity: hookOpacity,
                transform: `scale(${interpolate(hookScale, [0, 1], [0.85, 1])})`,
                textShadow: TEXT_SHADOW_STRONG,
                letterSpacing: -0.5,
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
                panelBg={theme.panelBg}
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
                color: "#fff",
                fontSize: 58,
                fontWeight: 900,
                textAlign: "center",
                lineHeight: 1.25,
                maxWidth: 900,
                textShadow: TEXT_SHADOW_STRONG,
                letterSpacing: -0.5,
              }}
            >
              {script.cta}
            </div>
            {/* Accent underline bar */}
            <div
              style={{
                width: 140,
                height: 6,
                backgroundColor: theme.accentColor,
                borderRadius: 3,
                marginTop: 28,
                boxShadow: `0 0 18px ${theme.accentColor}aa`,
              }}
            />
            {disclaimer && (
              <div
                style={{
                  color: "#ffffffb0",
                  fontSize: 22,
                  marginTop: 24,
                  textAlign: "center",
                  textShadow: "0 2px 6px rgba(0, 0, 0, 0.85)",
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
