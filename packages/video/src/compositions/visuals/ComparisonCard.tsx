import React from "react";
import { AbsoluteFill, useCurrentFrame, spring, useVideoConfig, interpolate } from "remotion";

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
  const translateX = direction === "left"
    ? interpolate(slideProgress, [0, 1], [-400, 0])
    : interpolate(slideProgress, [0, 1], [400, 0]);

  return (
    <div
      style={{
        flex: 1,
        backgroundColor: "#ffffff08",
        borderRadius: 20,
        padding: "32px 28px",
        border: `1px solid ${accentColor}30`,
        transform: `translateX(${translateX}px)`,
        opacity: slideProgress,
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      {/* Name */}
      <div
        style={{
          color: accentColor,
          fontSize: 32,
          fontWeight: 800,
          fontFamily: "Inter, sans-serif",
          textAlign: "center",
          paddingBottom: 16,
          borderBottom: `2px solid ${accentColor}30`,
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
            }}
          >
            <span
              style={{
                color: "#ffffff80",
                fontSize: 24,
                fontFamily: "Inter, sans-serif",
              }}
            >
              {spec.label}
            </span>
            <span
              style={{
                color: "#ffffffee",
                fontSize: 26,
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
  durationInFrames,
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
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: "60px 40px",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 24,
          width: "100%",
          maxWidth: 960,
          alignItems: "stretch",
        }}
      >
        <Card side={left} accentColor={accentColor} slideProgress={slideProgress} direction="left" frame={frame} />

        {/* Divider */}
        <div
          style={{
            width: 2,
            backgroundColor: `${accentColor}50`,
            transform: `scaleY(${dividerScale})`,
            alignSelf: "stretch",
          }}
        />

        <Card side={right} accentColor={accentColor} slideProgress={slideProgress} direction="right" frame={frame} />
      </div>
    </AbsoluteFill>
  );
};
