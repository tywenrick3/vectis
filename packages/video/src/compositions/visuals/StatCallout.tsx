import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { TEXT_SHADOW_HERO, TEXT_SHADOW_BODY } from "./themes";

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
      fontSize: 56,
      color,
      marginRight: 12,
      lineHeight: 1,
      textShadow: TEXT_SHADOW_HERO,
    }}
  >
    {direction === "up" ? "▲" : "▼"}
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
    [0, 0.55, 0.3],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const arrowOpacity = interpolate(frame, [8, 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const directionColor =
    direction === "up" ? "#34d977" : direction === "down" ? "#ff5a6b" : accentColor;

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {/* Radial glow behind number — acts as an ambient anchor on gameplay */}
      <div
        style={{
          position: "absolute",
          width: 420,
          height: 420,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accentColor}40 0%, transparent 68%)`,
          opacity: glowPulse,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
        }}
      />

      {/* Value row */}
      <div
        style={{
          position: "relative",
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
            fontSize: 104,
            fontWeight: 900,
            fontFamily: "Inter, sans-serif",
            letterSpacing: -3,
            textAlign: "center",
            textShadow: TEXT_SHADOW_HERO,
          }}
        >
          {value}
        </div>
      </div>

      {/* Label */}
      <div
        style={{
          position: "relative",
          color: "#ffffff",
          fontSize: 28,
          fontWeight: 600,
          fontFamily: "Inter, sans-serif",
          marginTop: 16,
          opacity: labelOpacity,
          transform: `translateY(${labelY}px)`,
          textAlign: "center",
          maxWidth: 780,
          lineHeight: 1.35,
          textShadow: TEXT_SHADOW_BODY,
        }}
      >
        {label}
      </div>
    </div>
  );
};
