import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { NicheTheme } from "./themes";

interface BackgroundFXProps {
  theme: NicheTheme;
}

/**
 * Layered, "designed-feeling" background:
 *   1. base linear gradient (from theme)
 *   2. 3 drifting blurred mesh blobs in saturated theme colors
 *   3. faint dot grid for depth
 *   4. SVG fractal-noise grain overlay
 *   5. radial vignette to focus the eye
 */
export const BackgroundFX: React.FC<BackgroundFXProps> = ({ theme }) => {
  const frame = useCurrentFrame();

  // Slow drift on the base gradient angle
  const angle = (frame * 0.6) % 360;

  // Each blob orbits its own center with slightly different speeds + radii
  const blob = (i: number, speedX: number, speedY: number) => {
    const cx = 50 + Math.sin(frame * speedX + i) * 22;
    const cy = 50 + Math.cos(frame * speedY + i * 1.7) * 22;
    return { cx, cy };
  };

  const b0 = blob(0, 0.012, 0.009);
  const b1 = blob(1, 0.009, 0.014);
  const b2 = blob(2, 0.015, 0.011);

  return (
    <AbsoluteFill>
      {/* 1. base gradient */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(${angle}deg, ${theme.gradientColors[0]} 0%, ${theme.gradientColors[1]} 50%, ${theme.gradientColors[2]} 100%)`,
        }}
      />

      {/* 2. drifting mesh blobs */}
      <AbsoluteFill
        style={{
          background: [
            `radial-gradient(circle at ${b0.cx}% ${b0.cy}%, ${theme.blobColors[0]}88 0%, transparent 38%)`,
            `radial-gradient(circle at ${b1.cx}% ${b1.cy}%, ${theme.blobColors[1]}77 0%, transparent 42%)`,
            `radial-gradient(circle at ${b2.cx}% ${b2.cy}%, ${theme.blobColors[2]}66 0%, transparent 45%)`,
          ].join(", "),
          filter: "blur(60px) saturate(140%)",
          mixBlendMode: "screen",
        }}
      />

      {/* 3. faint dot grid */}
      <AbsoluteFill
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          opacity: 0.5,
          mixBlendMode: "overlay",
        }}
      />

      {/* 4. SVG grain (static — kills the sterile look) */}
      <AbsoluteFill
        style={{
          opacity: 0.18,
          mixBlendMode: "overlay",
          backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.6 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`,
        }}
      />

      {/* 5. vignette */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.55) 100%)",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
