import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";

interface Bar {
  label: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  title: string;
  bars: Bar[];
  unit?: string;
  accentColor: string;
  durationInFrames: number;
}

export const BarChart: React.FC<BarChartProps> = ({
  title,
  bars,
  unit = "",
  accentColor,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const maxValue = Math.max(...bars.map((b) => b.value), 1);

  const titleOpacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: "clamp",
  });
  const titleY = interpolate(frame, [0, 12], [-20, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: "60px 50px",
      }}
    >
      {/* Title */}
      <div
        style={{
          color: "#ffffffdd",
          fontSize: 36,
          fontWeight: 700,
          fontFamily: "Inter, sans-serif",
          marginBottom: 50,
          textAlign: "center",
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
        }}
      >
        {title}
      </div>

      {/* Bars */}
      <div style={{ width: "100%", maxWidth: 800, display: "flex", flexDirection: "column", gap: 24 }}>
        {bars.map((bar, i) => {
          const staggerDelay = i * 6;
          const barGrowEnd = Math.min(durationInFrames * 0.6, 40) + staggerDelay;

          const barWidth = interpolate(
            frame,
            [8 + staggerDelay, barGrowEnd],
            [0, (bar.value / maxValue) * 100],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );

          const labelOpacity = interpolate(
            frame,
            [staggerDelay, 8 + staggerDelay],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );

          const valueOpacity = interpolate(
            frame,
            [barGrowEnd - 5, barGrowEnd + 5],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );

          const barColor = bar.color || accentColor;

          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {/* Label */}
              <div
                style={{
                  color: "#ffffffcc",
                  fontSize: 26,
                  fontWeight: 600,
                  fontFamily: "Inter, sans-serif",
                  width: 160,
                  textAlign: "right",
                  opacity: labelOpacity,
                  flexShrink: 0,
                }}
              >
                {bar.label}
              </div>

              {/* Bar track */}
              <div
                style={{
                  flex: 1,
                  height: 40,
                  backgroundColor: "#ffffff10",
                  borderRadius: 8,
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                {/* Bar fill */}
                <div
                  style={{
                    width: `${barWidth}%`,
                    height: "100%",
                    background: `linear-gradient(90deg, ${barColor}cc, ${barColor})`,
                    borderRadius: 8,
                    boxShadow: `0 0 20px ${barColor}40`,
                  }}
                />
              </div>

              {/* Value */}
              <div
                style={{
                  color: barColor,
                  fontSize: 26,
                  fontWeight: 700,
                  fontFamily: "Inter, sans-serif",
                  width: 100,
                  opacity: valueOpacity,
                  flexShrink: 0,
                }}
              >
                {bar.value}{unit}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
