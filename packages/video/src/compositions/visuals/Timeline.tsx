import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { evolvePath } from "@remotion/paths";

interface TimelineEvent {
  label: string;
  detail?: string;
}

interface TimelineProps {
  title?: string;
  events: TimelineEvent[];
  accentColor: string;
  durationInFrames: number;
}

export const Timeline: React.FC<TimelineProps> = ({
  title,
  events,
  accentColor,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const eventCount = events.length;

  // Layout constants
  const dotRadius = 10;
  const lineX = 50;
  const topY = 0;
  const spacing = 100;
  const totalLineHeight = (eventCount - 1) * spacing;
  const bottomY = topY + totalLineHeight;

  // Line draw animation: fills over 70% of duration
  const lineDrawEnd = Math.floor(durationInFrames * 0.7);
  const lineProgress = interpolate(frame, [6, lineDrawEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const linePath = `M ${lineX} ${topY} L ${lineX} ${bottomY}`;
  const evolved = evolvePath(lineProgress, linePath);

  // Title animation
  const titleOpacity = title
    ? interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" })
    : 1;
  const titleY = title
    ? interpolate(frame, [0, 10], [-15, 0], { extrapolateRight: "clamp" })
    : 0;

  // SVG dimensions
  const svgWidth = 700;
  const svgHeight = totalLineHeight + dotRadius * 2;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: "60px 40px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 800 }}>
        {/* Title */}
        {title && (
          <div
            style={{
              color: "#ffffffdd",
              fontSize: 34,
              fontWeight: 700,
              fontFamily: "Inter, sans-serif",
              marginBottom: 40,
              textAlign: "center",
              opacity: titleOpacity,
              transform: `translateY(${titleY}px)`,
            }}
          >
            {title}
          </div>
        )}

        {/* Timeline body */}
        <div style={{ position: "relative", width: svgWidth, height: svgHeight, margin: "0 auto" }}>
          {/* SVG line + dots */}
          <svg
            width={svgWidth}
            height={svgHeight}
            style={{ position: "absolute", top: 0, left: 0 }}
          >
            {/* Track line (faint) */}
            <path
              d={linePath}
              stroke="#ffffff10"
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
            />

            {/* Animated drawn line */}
            <path
              d={linePath}
              stroke={accentColor}
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={evolved.strokeDasharray}
              strokeDashoffset={evolved.strokeDashoffset}
              style={{ filter: `drop-shadow(0 0 6px ${accentColor}50)` }}
            />
          </svg>

          {/* Event dots + labels */}
          {events.map((event, i) => {
            const eventY = topY + i * spacing;

            // Dot appears when the line reaches its Y position
            const eventLineProgress = eventCount > 1 ? i / (eventCount - 1) : 0;
            const dotReachedFrame = 6 + eventLineProgress * (lineDrawEnd - 6);

            const dotSpring = spring({
              frame: frame - dotReachedFrame,
              fps,
              config: { damping: 10, stiffness: 140, mass: 0.5 },
            });
            const dotScale = Math.max(0, dotSpring);

            // Label slides in slightly after dot
            const labelDelay = dotReachedFrame + 4;
            const labelOpacity = interpolate(
              frame,
              [labelDelay, labelDelay + 10],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );
            const labelX = interpolate(
              frame,
              [labelDelay, labelDelay + 10],
              [30, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );

            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  top: eventY - dotRadius,
                  left: 0,
                  display: "flex",
                  alignItems: "center",
                  height: dotRadius * 2,
                }}
              >
                {/* Dot */}
                <div
                  style={{
                    position: "absolute",
                    left: lineX - dotRadius,
                    width: dotRadius * 2,
                    height: dotRadius * 2,
                    borderRadius: "50%",
                    backgroundColor: accentColor,
                    transform: `scale(${dotScale})`,
                    boxShadow: `0 0 14px ${accentColor}50`,
                  }}
                />

                {/* Label + detail */}
                <div
                  style={{
                    position: "absolute",
                    left: lineX + dotRadius + 24,
                    opacity: labelOpacity,
                    transform: `translateX(${labelX}px)`,
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <span
                    style={{
                      color: "#ffffffdd",
                      fontSize: 28,
                      fontWeight: 600,
                      fontFamily: "Inter, sans-serif",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {event.label}
                  </span>
                  {event.detail && (
                    <span
                      style={{
                        color: "#ffffff88",
                        fontSize: 22,
                        fontWeight: 400,
                        fontFamily: "Inter, sans-serif",
                        maxWidth: 500,
                      }}
                    >
                      {event.detail}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
