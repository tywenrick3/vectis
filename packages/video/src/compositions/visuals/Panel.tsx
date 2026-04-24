import React from "react";
import { useCurrentFrame, spring, useVideoConfig } from "remotion";

interface PanelProps {
  accentColor: string;
  panelBg: string;
  children: React.ReactNode;
}

// Auto-sized dark-glass chip. No fixed width/height — hugs its children, bounded
// only by maxWidth. Caller is responsible for positioning (wrap in AbsoluteFill).
export const Panel: React.FC<PanelProps> = ({
  accentColor,
  panelBg,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrance = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 120, mass: 0.7 },
  });
  const translateY = (1 - Math.min(1, entrance)) * -12;
  const opacity = Math.min(1, entrance * 1.4);

  return (
    <div
      style={{
        maxWidth: 900,
        backgroundColor: panelBg,
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        border: `1px solid ${accentColor}33`,
        borderRadius: 20,
        padding: "28px 32px",
        boxShadow: "0 14px 36px rgba(0, 0, 0, 0.42)",
        transform: `translateY(${translateY}px)`,
        opacity,
      }}
    >
      {children}
    </div>
  );
};
