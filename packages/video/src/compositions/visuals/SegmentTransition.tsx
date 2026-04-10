import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import type { TransitionStyle } from "@vectis/shared";

interface SegmentTransitionProps {
  durationInFrames: number;
  children: React.ReactNode;
  style?: TransitionStyle;
}

export const SegmentTransition: React.FC<SegmentTransitionProps> = ({
  durationInFrames,
  children,
  style = "fade",
}) => {
  const frame = useCurrentFrame();

  // Exit: last 6 frames (shared across most styles)
  const exitStart = durationInFrames - 6;
  const exitOpacity = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (style === "cut") {
    // Hard cut — instant on, instant off, no easing
    return (
      <AbsoluteFill style={{ opacity: frame < durationInFrames ? 1 : 0 }}>
        {children}
      </AbsoluteFill>
    );
  }

  if (style === "zoom_in") {
    // Zoom from 1.15 → 1.0 (feels like camera pulling focus)
    const enterScale = interpolate(frame, [0, 12], [1.15, 1], {
      extrapolateRight: "clamp",
    });
    const enterOpacity = interpolate(frame, [0, 8], [0, 1], {
      extrapolateRight: "clamp",
    });
    const exitScale = interpolate(frame, [exitStart, durationInFrames], [1, 0.95], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

    const opacity = Math.min(enterOpacity, exitOpacity);
    const scale = frame < exitStart ? enterScale : exitScale;

    return (
      <AbsoluteFill style={{ opacity, transform: `scale(${scale})` }}>
        {children}
      </AbsoluteFill>
    );
  }

  if (style === "slide_left") {
    // Slide in from right, slide out to left
    const enterX = interpolate(frame, [0, 10], [120, 0], {
      extrapolateRight: "clamp",
    });
    const enterOpacity = interpolate(frame, [0, 8], [0, 1], {
      extrapolateRight: "clamp",
    });
    const exitX = interpolate(frame, [exitStart, durationInFrames], [0, -120], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

    const opacity = Math.min(enterOpacity, exitOpacity);
    const x = frame < exitStart ? enterX : exitX;

    return (
      <AbsoluteFill style={{ opacity, transform: `translateX(${x}px)` }}>
        {children}
      </AbsoluteFill>
    );
  }

  if (style === "smash") {
    // Smash cut — scale up quickly from 1.06 with a snappy ease, slight overshoot
    const enterScale = interpolate(frame, [0, 4, 7], [1.06, 0.99, 1], {
      extrapolateRight: "clamp",
    });
    const enterOpacity = interpolate(frame, [0, 3], [0, 1], {
      extrapolateRight: "clamp",
    });
    const exitScale = interpolate(frame, [exitStart, durationInFrames], [1, 1.04], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

    const opacity = Math.min(enterOpacity, exitOpacity);
    const scale = frame < exitStart ? enterScale : exitScale;

    return (
      <AbsoluteFill style={{ opacity, transform: `scale(${scale})` }}>
        {children}
      </AbsoluteFill>
    );
  }

  // Default: "fade" — original behavior (fade + translateY + scale)
  const enterOpacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: "clamp",
  });
  const enterY = interpolate(frame, [0, 10], [30, 0], {
    extrapolateRight: "clamp",
  });
  const enterScale = interpolate(frame, [0, 10], [0.95, 1], {
    extrapolateRight: "clamp",
  });
  const exitScale = interpolate(frame, [exitStart, durationInFrames], [1, 0.97], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const opacity = Math.min(enterOpacity, exitOpacity);
  const scale = frame < exitStart ? enterScale : exitScale;

  return (
    <AbsoluteFill
      style={{
        opacity,
        transform: `translateY(${enterY}px) scale(${scale})`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
