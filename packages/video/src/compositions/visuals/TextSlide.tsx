import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { TEXT_SHADOW_HERO } from "./themes";

interface TextSlideProps {
  text: string;
  accentColor: string;
  durationInFrames: number;
}

export const TextSlide: React.FC<TextSlideProps> = ({
  text,
  accentColor: _accentColor,
  durationInFrames: _durationInFrames,
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

  const scale = interpolate(scaleSpring, [0, 1], [0.94, 1]);

  return (
    <div
      style={{
        color: "#ffffff",
        fontSize: 46,
        fontWeight: 800,
        fontFamily: "Inter, sans-serif",
        textAlign: "center",
        lineHeight: 1.35,
        maxWidth: 880,
        opacity: fadeIn,
        transform: `scale(${scale})`,
        letterSpacing: -0.5,
        textShadow: TEXT_SHADOW_HERO,
      }}
    >
      {text}
    </div>
  );
};
