import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { makePie } from "@remotion/shapes";
import { TEXT_SHADOW_HERO, TEXT_SHADOW_BODY } from "./themes";

interface PieChartProps {
  title?: string;
  value: number; // 0–1
  label: string;
  color?: string;
  accentColor: string;
  durationInFrames: number;
}

export const PieChart: React.FC<PieChartProps> = ({
  title,
  value,
  label,
  color,
  accentColor,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fillColor = color || accentColor;
  const radius = 130;
  const strokeWidth = 26;
  const innerRadius = radius - strokeWidth;

  // Animate progress from 0 to target value over 55% of duration
  const fillEnd = Math.floor(durationInFrames * 0.55);
  const progress = interpolate(frame, [8, fillEnd], [0, value], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const pie = makePie({ radius, progress, closePath: false });
  const track = makePie({ radius, progress: 0.999, closePath: false });

  const displayPercent = Math.round(progress * 100);

  const bounceSpring = spring({
    frame: frame - fillEnd,
    fps,
    config: { damping: 12, stiffness: 120, mass: 0.5 },
  });
  const percentScale = frame >= fillEnd ? 1 + (bounceSpring - 1) * 0.1 : 1;

  const titleOpacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: "clamp",
  });
  const titleY = interpolate(frame, [0, 10], [-12, 0], {
    extrapolateRight: "clamp",
  });

  const labelOpacity = interpolate(frame, [fillEnd, fillEnd + 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const labelY = interpolate(frame, [fillEnd, fillEnd + 12], [10, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const glowOpacity = interpolate(
    frame,
    [fillEnd, fillEnd + 10, durationInFrames],
    [0, 0.5, 0.25],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const svgSize = radius * 2 + strokeWidth;
  const viewBox = `${-strokeWidth / 2} ${-strokeWidth / 2} ${svgSize} ${svgSize}`;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {/* Title */}
      {title && (
        <div
          style={{
            color: "#ffffff",
            fontSize: 30,
            fontWeight: 700,
            fontFamily: "Inter, sans-serif",
            marginBottom: 22,
            textAlign: "center",
            opacity: titleOpacity,
            transform: `translateY(${titleY}px)`,
            textShadow: TEXT_SHADOW_BODY,
          }}
        >
          {title}
        </div>
      )}

      {/* Chart container */}
      <div style={{ position: "relative", width: svgSize, height: svgSize }}>
        {/* Glow */}
        <div
          style={{
            position: "absolute",
            inset: -40,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${fillColor}40 0%, transparent 70%)`,
            opacity: glowOpacity,
          }}
        />

        <svg width={svgSize} height={svgSize} viewBox={viewBox}>
          {/* Background track (darker so it reads on bright gameplay) */}
          <path
            d={track.path}
            fill="none"
            stroke="rgba(0, 0, 0, 0.45)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Animated fill arc */}
          {progress > 0.001 && (
            <path
              d={pie.path}
              fill="none"
              stroke={fillColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              style={{
                filter: `drop-shadow(0 0 14px ${fillColor}80)`,
              }}
            />
          )}
        </svg>

        {/* Center percentage */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: innerRadius * 2 - 12,
              height: innerRadius * 2 - 12,
              borderRadius: "50%",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <span
              style={{
                color: fillColor,
                fontSize: 68,
                fontWeight: 900,
                fontFamily: "Inter, sans-serif",
                letterSpacing: -2,
                transform: `scale(${percentScale})`,
                textShadow: TEXT_SHADOW_HERO,
              }}
            >
              {displayPercent}%
            </span>
          </div>
        </div>
      </div>

      {/* Label */}
      <div
        style={{
          color: "#ffffff",
          fontSize: 26,
          fontWeight: 600,
          fontFamily: "Inter, sans-serif",
          marginTop: 22,
          textAlign: "center",
          maxWidth: 780,
          lineHeight: 1.35,
          opacity: labelOpacity,
          transform: `translateY(${labelY}px)`,
          textShadow: TEXT_SHADOW_BODY,
        }}
      >
        {label}
      </div>
    </div>
  );
};
