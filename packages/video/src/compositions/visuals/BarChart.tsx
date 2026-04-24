import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { TEXT_SHADOW_BODY } from "./themes";

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
  const titleY = interpolate(frame, [0, 12], [-14, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ width: "100%", maxWidth: 820 }}>
      {/* Title */}
      <div
        style={{
          color: "#ffffff",
          fontSize: 30,
          fontWeight: 700,
          fontFamily: "Inter, sans-serif",
          marginBottom: 24,
          textAlign: "center",
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          textShadow: TEXT_SHADOW_BODY,
        }}
      >
        {title}
      </div>

      {/* Bars */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
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
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {/* Label */}
              <div
                style={{
                  color: "#ffffff",
                  fontSize: 22,
                  fontWeight: 600,
                  fontFamily: "Inter, sans-serif",
                  width: 150,
                  textAlign: "right",
                  opacity: labelOpacity,
                  flexShrink: 0,
                  textShadow: TEXT_SHADOW_BODY,
                }}
              >
                {bar.label}
              </div>

              {/* Bar track (darker for gameplay contrast) */}
              <div
                style={{
                  flex: 1,
                  height: 32,
                  backgroundColor: "rgba(0, 0, 0, 0.55)",
                  borderRadius: 8,
                  overflow: "hidden",
                  position: "relative",
                  boxShadow: "inset 0 1px 2px rgba(0, 0, 0, 0.5)",
                }}
              >
                <div
                  style={{
                    width: `${barWidth}%`,
                    height: "100%",
                    background: `linear-gradient(90deg, ${barColor}dd, ${barColor})`,
                    borderRadius: 8,
                    boxShadow: `0 0 16px ${barColor}50`,
                  }}
                />
              </div>

              {/* Value */}
              <div
                style={{
                  color: barColor,
                  fontSize: 22,
                  fontWeight: 800,
                  fontFamily: "Inter, sans-serif",
                  width: 90,
                  opacity: valueOpacity,
                  flexShrink: 0,
                  textShadow: TEXT_SHADOW_BODY,
                }}
              >
                {bar.value}{unit}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
