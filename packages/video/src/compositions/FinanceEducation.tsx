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

export const FinanceEducation: React.FC<CompositionProps> = ({
  script,
  voiceAsset,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const hookDurationFrames = 3 * fps;
  let currentFrame = hookDurationFrames;

  return (
    <AbsoluteFill
      style={{ backgroundColor: "#0a1628", fontFamily: "Inter, sans-serif" }}
    >
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
              color: "#00ff88",
              fontSize: 60,
              fontWeight: 800,
              textAlign: "center",
              opacity: interpolate(frame, [0, 15], [0, 1], {
                extrapolateRight: "clamp",
              }),
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
              <div
                style={{
                  position: "absolute",
                  top: 200,
                  color: "#ffd700",
                  fontSize: 28,
                  opacity: 0.7,
                  textTransform: "uppercase",
                  letterSpacing: 3,
                }}
              >
                {segment.visual_cue}
              </div>

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
              color: "#00ff88",
              fontSize: 52,
              fontWeight: 800,
              textAlign: "center",
            }}
          >
            {script.cta}
          </div>
          <div
            style={{
              color: "#ffffff80",
              fontSize: 24,
              marginTop: 20,
              textAlign: "center",
            }}
          >
            Educational content only — not financial advice
          </div>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
