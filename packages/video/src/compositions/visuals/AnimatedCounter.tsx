import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { TEXT_SHADOW_HERO, TEXT_SHADOW_BODY } from "./themes";

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
    [0, 0.55, 0.3],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {/* Ambient glow */}
      <div
        style={{
          position: "absolute",
          width: 380,
          height: 380,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accentColor}45 0%, transparent 68%)`,
          opacity: glowOpacity,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
        }}
      />

      {/* Counter value */}
      <div
        style={{
          position: "relative",
          color: accentColor,
          fontSize: 96,
          fontWeight: 900,
          fontFamily: "Inter, sans-serif",
          transform: `scale(${scale})`,
          textAlign: "center",
          letterSpacing: -2,
          textShadow: TEXT_SHADOW_HERO,
        }}
      >
        {prefix}{formatNumber(currentValue)}{suffix}
      </div>

      {/* Label */}
      <div
        style={{
          position: "relative",
          color: "#ffffff",
          fontSize: 30,
          fontWeight: 600,
          fontFamily: "Inter, sans-serif",
          marginTop: 16,
          opacity: labelOpacity,
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
