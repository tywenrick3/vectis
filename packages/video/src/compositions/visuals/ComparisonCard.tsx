import React from "react";
import { useCurrentFrame, spring, useVideoConfig, interpolate } from "remotion";

interface ComparisonSide {
  name: string;
  specs: { label: string; value: string }[];
}

interface ComparisonCardProps {
  left: ComparisonSide;
  right: ComparisonSide;
  accentColor: string;
  durationInFrames: number;
}

const Card: React.FC<{
  side: ComparisonSide;
  accentColor: string;
  slideProgress: number;
  direction: "left" | "right";
  frame: number;
}> = ({ side, accentColor, slideProgress, direction, frame }) => {
  const translateX =
    direction === "left"
      ? interpolate(slideProgress, [0, 1], [-220, 0])
      : interpolate(slideProgress, [0, 1], [220, 0]);

  return (
    <div
      style={{
        flex: 1,
        backgroundColor: "rgba(255, 255, 255, 0.04)",
        borderRadius: 14,
        padding: "18px 18px",
        border: `1px solid ${accentColor}33`,
        transform: `translateX(${translateX}px)`,
        opacity: slideProgress,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {/* Name */}
      <div
        style={{
          color: accentColor,
          fontSize: 26,
          fontWeight: 800,
          fontFamily: "Inter, sans-serif",
          textAlign: "center",
          paddingBottom: 10,
          borderBottom: `2px solid ${accentColor}44`,
        }}
      >
        {side.name}
      </div>

      {/* Specs */}
      {side.specs.map((spec, i) => {
        const specOpacity = interpolate(
          frame,
          [18 + i * 4, 26 + i * 4],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );

        return (
          <div
            key={i}
            style={{
              opacity: specOpacity,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                color: "#ffffffaa",
                fontSize: 20,
                fontFamily: "Inter, sans-serif",
              }}
            >
              {spec.label}
            </span>
            <span
              style={{
                color: "#ffffff",
                fontSize: 22,
                fontWeight: 700,
                fontFamily: "Inter, sans-serif",
              }}
            >
              {spec.value}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export const ComparisonCard: React.FC<ComparisonCardProps> = ({
  left,
  right,
  accentColor,
  durationInFrames: _durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slideProgress = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 80, mass: 0.8 },
  });

  const dividerScale = interpolate(frame, [10, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        width: "100%",
        alignItems: "stretch",
      }}
    >
      <Card
        side={left}
        accentColor={accentColor}
        slideProgress={slideProgress}
        direction="left"
        frame={frame}
      />

      {/* Divider */}
      <div
        style={{
          width: 2,
          backgroundColor: `${accentColor}66`,
          transform: `scaleY(${dividerScale})`,
          alignSelf: "stretch",
        }}
      />

      <Card
        side={right}
        accentColor={accentColor}
        slideProgress={slideProgress}
        direction="right"
        frame={frame}
      />
    </div>
  );
};
