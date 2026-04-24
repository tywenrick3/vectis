import type { CaptionStyle } from "../CaptionOverlay";

export interface NicheTheme {
  accentColor: string;
  secondaryAccent: string;
  gradientColors: [string, string, string];
  /** Saturated blob colors for the mesh-gradient background (fallback only). */
  blobColors: [string, string, string];
  captionStyle: CaptionStyle;
  fontFamily: string;
  /** Dark-glass surface used behind dense visual cues (ComparisonCard only). */
  panelBg: string;
}

// Shared text-shadow recipes — applied to any text that sits on gameplay without
// a panel backing. HERO for big hero numbers/titles, BODY for labels/list items.
export const TEXT_SHADOW_HERO =
  "0 2px 6px rgba(0, 0, 0, 0.95), 0 8px 24px rgba(0, 0, 0, 0.65)";
export const TEXT_SHADOW_BODY =
  "0 2px 5px rgba(0, 0, 0, 0.9), 0 4px 12px rgba(0, 0, 0, 0.55)";

export const THEMES: Record<string, NicheTheme> = {
  // Broadcast amber: warm accent reads against cool/green gameplay
  "tech-explainer": {
    accentColor: "#ffa23d",
    secondaryAccent: "#b084f7",
    gradientColors: ["#0d0818", "#1a1028", "#060310"],
    blobColors: ["#ffa23d", "#b084f7", "#ff6b4a"],
    captionStyle: {
      activeColor: "#ffa23d",
      inactiveColor: "#ffffffee",
      backgroundColor: "rgba(8, 6, 16, 0.82)",
      fontSize: 54,
    },
    fontFamily: "Inter, sans-serif",
    panelBg: "rgba(8, 6, 16, 0.85)",
  },
  // Refined money: emerald + warm gold, authoritative not rave
  "finance-education": {
    accentColor: "#10b981",
    secondaryAccent: "#f59e0b",
    gradientColors: ["#071a12", "#11261a", "#1a1a08"],
    blobColors: ["#10b981", "#f59e0b", "#ef6d3a"],
    captionStyle: {
      activeColor: "#10b981",
      inactiveColor: "#ffffffee",
      backgroundColor: "rgba(6, 14, 10, 0.82)",
      fontSize: 54,
    },
    fontFamily: "Inter, sans-serif",
    panelBg: "rgba(6, 14, 10, 0.85)",
  },
};
