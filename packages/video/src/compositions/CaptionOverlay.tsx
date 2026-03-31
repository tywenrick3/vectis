import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { TranscriptionWord } from "@vectis/shared";

export interface CaptionStyle {
  activeColor: string;
  inactiveColor: string;
  backgroundColor: string;
  fontSize: number;
}

interface CaptionOverlayProps {
  words: TranscriptionWord[];
  style: CaptionStyle;
}

const WORDS_VISIBLE = 5;

export const CaptionOverlay: React.FC<CaptionOverlayProps> = ({ words, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const currentTimeMs = (frame / fps) * 1000;

  // Find the index of the currently spoken word
  let activeIndex = -1;
  for (let i = 0; i < words.length; i++) {
    if (currentTimeMs >= words[i].start_ms && currentTimeMs <= words[i].end_ms) {
      activeIndex = i;
      break;
    }
    // Between words — highlight the next upcoming word
    if (
      i < words.length - 1 &&
      currentTimeMs > words[i].end_ms &&
      currentTimeMs < words[i + 1].start_ms
    ) {
      activeIndex = i;
      break;
    }
  }

  if (activeIndex === -1) return null;

  // Sliding window centered on active word
  const halfWindow = Math.floor(WORDS_VISIBLE / 2);
  let start = Math.max(0, activeIndex - halfWindow);
  const end = Math.min(words.length, start + WORDS_VISIBLE);
  start = Math.max(0, end - WORDS_VISIBLE);

  const visibleWords = words.slice(start, end);

  // Fade in/out the entire caption group
  const groupStart = words[start]?.start_ms ?? 0;
  const groupEnd = words[Math.min(end, words.length) - 1]?.end_ms ?? 0;

  const opacity = interpolate(
    currentTimeMs,
    [groupStart - 200, groupStart, groupEnd, groupEnd + 200],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 180,
        opacity,
      }}
    >
      <div
        style={{
          backgroundColor: style.backgroundColor,
          borderRadius: 16,
          padding: "16px 28px",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 10,
          maxWidth: 900,
        }}
      >
        {visibleWords.map((w, i) => {
          const globalIndex = start + i;
          const isActive = globalIndex === activeIndex;

          const wordProgress = isActive
            ? interpolate(
                currentTimeMs,
                [w.start_ms, w.start_ms + 100],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              )
            : globalIndex < activeIndex
              ? 1
              : 0;

          const scale = isActive
            ? interpolate(wordProgress, [0, 1], [1, 1.15])
            : 1;

          return (
            <span
              key={`${globalIndex}-${w.word}`}
              style={{
                color: wordProgress > 0 ? style.activeColor : style.inactiveColor,
                fontSize: style.fontSize,
                fontWeight: isActive ? 900 : 700,
                fontFamily: "Inter, sans-serif",
                transform: `scale(${scale})`,
                transition: "color 0.05s",
              }}
            >
              {w.word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
