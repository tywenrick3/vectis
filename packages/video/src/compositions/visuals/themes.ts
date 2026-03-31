import type { CaptionStyle } from "../CaptionOverlay";

export interface NicheTheme {
  accentColor: string;
  secondaryAccent: string;
  gradientColors: [string, string, string];
  captionStyle: CaptionStyle;
  fontFamily: string;
}

export const THEMES: Record<string, NicheTheme> = {
  "tech-explainer": {
    accentColor: "#00d4ff",
    secondaryAccent: "#7b61ff",
    gradientColors: ["#0a0a1a", "#0d2137", "#001a2c"],
    captionStyle: {
      activeColor: "#00d4ff",
      inactiveColor: "#ffffff99",
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      fontSize: 42,
    },
    fontFamily: "Inter, sans-serif",
  },
  "finance-education": {
    accentColor: "#00ff88",
    secondaryAccent: "#ffd700",
    gradientColors: ["#0a1628", "#0f2318", "#0a1a2f"],
    captionStyle: {
      activeColor: "#00ff88",
      inactiveColor: "#ffffff99",
      backgroundColor: "rgba(10, 22, 40, 0.8)",
      fontSize: 42,
    },
    fontFamily: "Inter, sans-serif",
  },
};
