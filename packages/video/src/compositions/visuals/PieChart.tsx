import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { makePie } from "@remotion/shapes";

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
  const radius = 140;
  const strokeWidth = 28;
  const innerRadius = radius - strokeWidth;

  // Animate progress from 0 to target value over 55% of duration
  const fillEnd = Math.floor(durationInFrames * 0.55);
  const progress = interpolate(frame, [8, fillEnd], [0, value], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Pie path for the filled arc
  const pie = makePie({ radius, progress, closePath: false });

  // Background track (full circle)
  const track = makePie({ radius, progress: 0.999, closePath: false });

  // Center percentage counts up in sync with the arc
  const displayPercent = Math.round(progress * 100);

  // Scale bounce when fill completes
  const bounceSpring = spring({
    frame: frame - fillEnd,
    fps,
    config: { damping: 12, stiffness: 120, mass: 0.5 },
  });
  const percentScale = frame >= fillEnd ? 1 + (bounceSpring - 1) * 0.1 : 1;

  // Title fade-in
  const titleOpacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: "clamp",
  });
  const titleY = interpolate(frame, [0, 10], [-15, 0], {
    extrapolateRight: "clamp",
  });

  // Label fade-in after fill
  const labelOpacity = interpolate(frame, [fillEnd, fillEnd + 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const labelY = interpolate(frame, [fillEnd, fillEnd + 12], [10, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Glow pulse behind the chart
  const glowOpacity = interpolate(
    frame,
    [fillEnd, fillEnd + 10, durationInFrames],
    [0, 0.4, 0.2],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const viewBox = `0 0 ${pie.width} ${pie.height}`;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: 60,
      }}
    >
      {/* Title */}
      {title && (
        <div
          style={{
            color: "#ffffffdd",
            fontSize: 34,
            fontWeight: 700,
            fontFamily: "Inter, sans-serif",
            marginBottom: 36,
            textAlign: "center",
            opacity: titleOpacity,
            transform: `translateY(${titleY}px)`,
          }}
        >
          {title}
        </div>
      )}

      {/* Chart container */}
      <div style={{ position: "relative", width: radius * 2, height: radius * 2 }}>
        {/* Glow */}
        <div
          style={{
            position: "absolute",
            inset: -40,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${fillColor}30 0%, transparent 70%)`,
            opacity: glowOpacity,
          }}
        />

        <svg width={radius * 2} height={radius * 2} viewBox={viewBox}>
          {/* Background track */}
          <path
            d={track.path}
            fill="none"
            stroke="#ffffff12"
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
                filter: `drop-shadow(0 0 12px ${fillColor}60)`,
              }}
            />
          )}
        </svg>

        {/* Center donut hole + percentage */}
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
                fontSize: 72,
                fontWeight: 900,
                fontFamily: "Inter, sans-serif",
                letterSpacing: -2,
                transform: `scale(${percentScale})`,
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
          color: "#ffffffcc",
          fontSize: 28,
          fontWeight: 500,
          fontFamily: "Inter, sans-serif",
          marginTop: 32,
          textAlign: "center",
          maxWidth: 700,
          opacity: labelOpacity,
          transform: `translateY(${labelY}px)`,
        }}
      >
        {label}
      </div>
    </AbsoluteFill>
  );
};
