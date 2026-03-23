import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";
import type { CompositionProps } from "./Root.js";

export const TechExplainer: React.FC<CompositionProps> = ({
  script,
  voiceAsset,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const hookDurationFrames = 3 * fps;
  let currentFrame = hookDurationFrames;

  return (
    <AbsoluteFill
      style={{ backgroundColor: "#0f0f0f", fontFamily: "Inter, sans-serif" }}
    >
      {/* Audio track */}
      {voiceAsset.audio_url && <Audio src={voiceAsset.audio_url} />}

      {/* Hook */}
      <Sequence durationInFrames={hookDurationFrames}>
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
              fontSize: 64,
              fontWeight: 800,
              textAlign: "center",
              opacity: interpolate(frame, [0, 15], [0, 1], {
                extrapolateRight: "clamp",
              }),
              transform: `scale(${interpolate(frame, [0, 15], [0.8, 1], { extrapolateRight: "clamp" })})`,
            }}
          >
            {script.hook}
          </div>
        </AbsoluteFill>
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
            <AbsoluteFill
              style={{
                justifyContent: "center",
                alignItems: "center",
                padding: 60,
              }}
            >
              {/* Visual cue label */}
              <div
                style={{
                  position: "absolute",
                  top: 200,
                  color: "#00d4ff",
                  fontSize: 28,
                  opacity: 0.7,
                  textTransform: "uppercase",
                  letterSpacing: 3,
                }}
              >
                {segment.visual_cue}
              </div>

              {/* Narration text */}
              <div
                style={{
                  color: "#ffffff",
                  fontSize: 48,
                  fontWeight: 700,
                  textAlign: "center",
                  lineHeight: 1.4,
                  maxWidth: 900,
                }}
              >
                {segment.narration}
              </div>
            </AbsoluteFill>
          </Sequence>
        );
      })}

      {/* CTA */}
      <Sequence from={currentFrame}>
        <AbsoluteFill
          style={{
            justifyContent: "center",
            alignItems: "center",
            padding: 60,
          }}
        >
          <div
            style={{
              color: "#00d4ff",
              fontSize: 56,
              fontWeight: 800,
              textAlign: "center",
            }}
          >
            {script.cta}
          </div>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
