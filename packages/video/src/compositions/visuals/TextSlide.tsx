import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

interface TextSlideProps {
  text: string;
  accentColor: string;
  durationInFrames: number;
}

export const TextSlide: React.FC<TextSlideProps> = ({
  text,
  accentColor,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeIn = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: "clamp",
  });

  const scaleSpring = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 100, mass: 0.7 },
  });

  const scale = interpolate(scaleSpring, [0, 1], [0.92, 1]);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: "60px 50px",
      }}
    >
      <div
        style={{
          color: "#ffffffee",
          fontSize: 38,
          fontWeight: 600,
          fontFamily: "Inter, sans-serif",
          textAlign: "center",
          lineHeight: 1.5,
          maxWidth: 800,
          opacity: fadeIn,
          transform: `scale(${scale})`,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};
