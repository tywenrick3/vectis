import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

interface ProgressBarProps {
  color: string;
  height?: number;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  color,
  height = 4,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const progress = (frame / durationInFrames) * 100;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: `${progress}%`,
        height,
        backgroundColor: color,
        zIndex: 100,
        borderRadius: "0 2px 2px 0",
      }}
    />
  );
};
