import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

interface StatCalloutProps {
  value: string;
  label: string;
  direction?: "up" | "down" | "neutral";
  accentColor: string;
  durationInFrames: number;
}

const DirectionArrow: React.FC<{ direction: "up" | "down"; color: string }> = ({
  direction,
  color,
}) => (
  <span
    style={{
      fontSize: 64,
      color,
      marginRight: 12,
      lineHeight: 1,
    }}
  >
    {direction === "up" ? "\u25B2" : "\u25BC"}
  </span>
);

export const StatCallout: React.FC<StatCalloutProps> = ({
  value,
  label,
  direction = "neutral",
  accentColor,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scaleSpring = spring({
    frame,
    fps,
    config: { damping: 10, stiffness: 120, mass: 0.6 },
  });

  const labelOpacity = interpolate(frame, [15, 28], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const labelY = interpolate(frame, [15, 28], [15, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const glowPulse = interpolate(
    frame,
    [0, durationInFrames * 0.4, durationInFrames],
    [0, 0.5, 0.25],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const arrowOpacity = interpolate(frame, [8, 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const directionColor =
    direction === "up" ? "#00ff88" : direction === "down" ? "#ff4466" : accentColor;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: 60,
      }}
    >
      {/* Radial glow */}
      <div
        style={{
          position: "absolute",
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accentColor}35 0%, transparent 70%)`,
          opacity: glowPulse,
        }}
      />

      {/* Value row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${scaleSpring})`,
        }}
      >
        {direction !== "neutral" && (
          <div style={{ opacity: arrowOpacity }}>
            <DirectionArrow direction={direction} color={directionColor} />
          </div>
        )}
        <div
          style={{
            color: accentColor,
            fontSize: 108,
            fontWeight: 900,
            fontFamily: "Inter, sans-serif",
            letterSpacing: -3,
            textAlign: "center",
          }}
        >
          {value}
        </div>
      </div>

      {/* Label */}
      <div
        style={{
          color: "#ffffffcc",
          fontSize: 30,
          fontWeight: 500,
          fontFamily: "Inter, sans-serif",
          marginTop: 24,
          opacity: labelOpacity,
          transform: `translateY(${labelY}px)`,
          textAlign: "center",
          maxWidth: 700,
        }}
      >
        {label}
      </div>
    </AbsoluteFill>
  );
};
