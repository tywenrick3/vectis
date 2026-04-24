import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { TEXT_SHADOW_BODY } from "./themes";

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

const DOT_SIZE = 14;
const CONNECTOR_WIDTH = 2;
const DOT_COLUMN_WIDTH = 24;

export const Timeline: React.FC<TimelineProps> = ({
  title,
  events,
  accentColor,
  durationInFrames: _durationInFrames,
}) => {
  const frame = useCurrentFrame();

  const titleOpacity = title
    ? interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" })
    : 1;
  const titleY = title
    ? interpolate(frame, [0, 10], [-12, 0], { extrapolateRight: "clamp" })
    : 0;

  const headOffset = title ? 14 : 6;

  return (
    <div style={{ width: "100%", maxWidth: 820 }}>
      {/* Title */}
      {title && (
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
      )}

      {/* Events — flex column; each row takes its natural height */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {events.map((event, i) => {
          const isLast = i === events.length - 1;
          const revealStart = headOffset + i * 8;
          const dotScale = interpolate(
            frame,
            [revealStart, revealStart + 6],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          const contentOpacity = interpolate(
            frame,
            [revealStart + 2, revealStart + 12],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          const contentX = interpolate(
            frame,
            [revealStart + 2, revealStart + 12],
            [16, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          const connectorScale = interpolate(
            frame,
            [revealStart + 4, revealStart + 14],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );

          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "stretch",
                gap: 16,
                paddingBottom: isLast ? 0 : 16,
              }}
            >
              {/* Dot column */}
              <div
                style={{
                  width: DOT_COLUMN_WIDTH,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: DOT_SIZE,
                    height: DOT_SIZE,
                    borderRadius: "50%",
                    backgroundColor: accentColor,
                    transform: `scale(${dotScale})`,
                    boxShadow: `0 0 14px ${accentColor}80, 0 2px 4px rgba(0, 0, 0, 0.5)`,
                    marginTop: 6,
                    flexShrink: 0,
                  }}
                />
                {!isLast && (
                  <div
                    style={{
                      width: CONNECTOR_WIDTH,
                      flex: 1,
                      backgroundColor: `${accentColor}88`,
                      boxShadow: `0 0 6px ${accentColor}50`,
                      marginTop: 4,
                      transform: `scaleY(${connectorScale})`,
                      transformOrigin: "top",
                    }}
                  />
                )}
              </div>

              {/* Content */}
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  opacity: contentOpacity,
                  transform: `translateX(${contentX}px)`,
                }}
              >
                <span
                  style={{
                    color: "#ffffff",
                    fontSize: 26,
                    fontWeight: 700,
                    fontFamily: "Inter, sans-serif",
                    lineHeight: 1.3,
                    textShadow: TEXT_SHADOW_BODY,
                  }}
                >
                  {event.label}
                </span>
                {event.detail && (
                  <span
                    style={{
                      color: "#ffffffdd",
                      fontSize: 20,
                      fontWeight: 500,
                      fontFamily: "Inter, sans-serif",
                      lineHeight: 1.4,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      textShadow: TEXT_SHADOW_BODY,
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
  );
};
