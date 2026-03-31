import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";

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
  durationInFrames,
}) => {
  const frame = useCurrentFrame();

  const titleOpacity = title
    ? interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" })
    : 1;
  const titleY = title
    ? interpolate(frame, [0, 10], [-15, 0], { extrapolateRight: "clamp" })
    : 0;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: "60px 50px",
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

        {/* Items */}
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {items.map((item, i) => {
            const staggerStart = (title ? 12 : 4) + i * 7;
            const itemOpacity = interpolate(
              frame,
              [staggerStart, staggerStart + 8],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );
            const itemX = interpolate(
              frame,
              [staggerStart, staggerStart + 8],
              [40, 0],
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
                    marginTop: 10,
                    boxShadow: `0 0 12px ${accentColor}60`,
                  }}
                />
                {/* Text */}
                <div
                  style={{
                    color: "#ffffffdd",
                    fontSize: 28,
                    fontWeight: 500,
                    fontFamily: "Inter, sans-serif",
                    lineHeight: 1.4,
                  }}
                >
                  {item}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
