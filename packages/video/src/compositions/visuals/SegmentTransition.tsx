import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";

interface SegmentTransitionProps {
  durationInFrames: number;
  children: React.ReactNode;
}

export const SegmentTransition: React.FC<SegmentTransitionProps> = ({
  durationInFrames,
  children,
}) => {
  const frame = useCurrentFrame();

  // Entrance: first 10 frames
  const enterOpacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: "clamp",
  });
  const enterY = interpolate(frame, [0, 10], [30, 0], {
    extrapolateRight: "clamp",
  });
  const enterScale = interpolate(frame, [0, 10], [0.95, 1], {
    extrapolateRight: "clamp",
  });

  // Exit: last 8 frames
  const exitStart = durationInFrames - 8;
  const exitOpacity = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exitScale = interpolate(frame, [exitStart, durationInFrames], [1, 0.97], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const opacity = Math.min(enterOpacity, exitOpacity);
  const scale = frame < exitStart ? enterScale : exitScale;

  return (
    <AbsoluteFill
      style={{
        opacity,
        transform: `translateY(${enterY}px) scale(${scale})`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
