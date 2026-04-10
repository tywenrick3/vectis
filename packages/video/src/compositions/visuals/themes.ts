import type { CaptionStyle } from "../CaptionOverlay";

export interface NicheTheme {
  accentColor: string;
  secondaryAccent: string;
  gradientColors: [string, string, string];
  /** Saturated blob colors for the mesh-gradient background. */
  blobColors: [string, string, string];
  captionStyle: CaptionStyle;
  fontFamily: string;
}

export const THEMES: Record<string, NicheTheme> = {
  // Cyberpunk: deep indigo base, electric cyan + magenta blobs
  "tech-explainer": {
    accentColor: "#00f0ff",
    secondaryAccent: "#ff2bd6",
    gradientColors: ["#0b0220", "#1a0540", "#04001a"],
    blobColors: ["#00f0ff", "#ff2bd6", "#7b2bff"],
    captionStyle: {
      activeColor: "#00f0ff",
      inactiveColor: "#ffffffaa",
      backgroundColor: "rgba(10, 0, 30, 0.65)",
      fontSize: 42,
    },
    fontFamily: "Inter, sans-serif",
  },
  // Warm money: charcoal base, lime green + gold blobs
  "finance-education": {
    accentColor: "#3dff9a",
    secondaryAccent: "#ffcc33",
    gradientColors: ["#0d1b13", "#1a2e0c", "#241a05"],
    blobColors: ["#3dff9a", "#ffcc33", "#ff6a3d"],
    captionStyle: {
      activeColor: "#3dff9a",
      inactiveColor: "#ffffffaa",
      backgroundColor: "rgba(15, 25, 10, 0.7)",
      fontSize: 42,
    },
    fontFamily: "Inter, sans-serif",
  },
};
