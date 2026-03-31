import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

interface AnimatedCounterProps {
  value: number;
  prefix?: string;
  suffix?: string;
  label: string;
  accentColor: string;
  durationInFrames: number;
}

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1e12) return (n / 1e12).toFixed(1).replace(/\.0$/, "") + "T";
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return Math.round(n).toLocaleString();
}

export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  value,
  prefix = "",
  suffix = "",
  label,
  accentColor,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const countEnd = Math.floor(durationInFrames * 0.6);
  const currentValue = interpolate(frame, [0, countEnd], [0, value], {
    extrapolateRight: "clamp",
  });

  const bounceScale = spring({
    frame: frame - countEnd,
    fps,
    config: { damping: 8, stiffness: 150, mass: 0.5 },
  });
  const scale = frame >= countEnd ? 1 + (bounceScale - 1) * 0.15 : 1;

  const labelOpacity = interpolate(frame, [countEnd, countEnd + 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const glowOpacity = interpolate(
    frame,
    [countEnd, countEnd + 10, durationInFrames],
    [0, 0.4, 0.2],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: 60,
      }}
    >
      {/* Glow behind number */}
      <div
        style={{
          position: "absolute",
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accentColor}40 0%, transparent 70%)`,
          opacity: glowOpacity,
        }}
      />

      {/* Counter value */}
      <div
        style={{
          color: accentColor,
          fontSize: 96,
          fontWeight: 900,
          fontFamily: "Inter, sans-serif",
          transform: `scale(${scale})`,
          textAlign: "center",
          letterSpacing: -2,
        }}
      >
        {prefix}{formatNumber(currentValue)}{suffix}
      </div>

      {/* Label */}
      <div
        style={{
          color: "#ffffffcc",
          fontSize: 32,
          fontWeight: 500,
          fontFamily: "Inter, sans-serif",
          marginTop: 20,
          opacity: labelOpacity,
          textAlign: "center",
          maxWidth: 700,
        }}
      >
        {label}
      </div>
    </AbsoluteFill>
  );
};
