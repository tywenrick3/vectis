import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

interface AnimatedGradientProps {
  colors: [string, string, string];
  speed?: number;
}

export const AnimatedGradient: React.FC<AnimatedGradientProps> = ({
  colors,
  speed = 0.3,
}) => {
  const frame = useCurrentFrame();

  const angle = (frame * speed) % 360;
  const shift1 = 30 + Math.sin(frame * 0.02) * 20;
  const shift2 = 60 + Math.cos(frame * 0.015) * 15;

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${angle}deg, ${colors[0]} ${shift1}%, ${colors[1]} ${shift2}%, ${colors[2]} 100%)`,
      }}
    />
  );
};
