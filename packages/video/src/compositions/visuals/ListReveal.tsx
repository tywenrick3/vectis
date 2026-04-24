import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { TEXT_SHADOW_BODY } from "./themes";

interface ListRevealProps {
  title?: string;
  items: string[];
  accentColor: string;
  durationInFrames: number;
}

export const ListReveal: React.FC<ListRevealProps> = ({
  title,
  items,
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

      {/* Items */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {items.map((item, i) => {
          const staggerStart = (title ? 12 : 4) + i * 6;
          const itemOpacity = interpolate(
            frame,
            [staggerStart, staggerStart + 8],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          const itemX = interpolate(
            frame,
            [staggerStart, staggerStart + 8],
            [28, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );

          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 16,
                opacity: itemOpacity,
                transform: `translateX(${itemX}px)`,
              }}
            >
              {/* Bullet */}
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  backgroundColor: accentColor,
                  flexShrink: 0,
                  marginTop: 11,
                  boxShadow: `0 0 14px ${accentColor}80, 0 2px 4px rgba(0, 0, 0, 0.5)`,
                }}
              />
              {/* Text */}
              <div
                style={{
                  color: "#ffffff",
                  fontSize: 26,
                  fontWeight: 600,
                  fontFamily: "Inter, sans-serif",
                  lineHeight: 1.4,
                  textShadow: TEXT_SHADOW_BODY,
                }}
              >
                {item}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
