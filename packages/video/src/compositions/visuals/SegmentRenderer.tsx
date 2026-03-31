import React from "react";
import { isStructuredCue, type VisualCue } from "@vectis/shared";
import { AnimatedCounter } from "./AnimatedCounter";
import { BarChart } from "./BarChart";
import { ComparisonCard } from "./ComparisonCard";
import { StatCallout } from "./StatCallout";
import { ListReveal } from "./ListReveal";
import { TextSlide } from "./TextSlide";

interface SegmentRendererProps {
  visualCue: string | VisualCue;
  narration: string;
  accentColor: string;
  durationInFrames: number;
}

export const SegmentRenderer: React.FC<SegmentRendererProps> = ({
  visualCue,
  narration,
  accentColor,
  durationInFrames,
}) => {
  // Legacy string cues → TextSlide fallback
  if (!isStructuredCue(visualCue)) {
    return (
      <TextSlide
        text={visualCue || narration}
        accentColor={accentColor}
        durationInFrames={durationInFrames}
      />
    );
  }

  switch (visualCue.type) {
    case "animated_counter":
      return (
        <AnimatedCounter
          value={visualCue.value}
          prefix={visualCue.prefix}
          suffix={visualCue.suffix}
          label={visualCue.label}
          accentColor={accentColor}
          durationInFrames={durationInFrames}
        />
      );

    case "bar_chart":
      return (
        <BarChart
          title={visualCue.title}
          bars={visualCue.bars}
          unit={visualCue.unit}
          accentColor={accentColor}
          durationInFrames={durationInFrames}
        />
      );

    case "comparison":
      return (
        <ComparisonCard
          left={visualCue.left}
          right={visualCue.right}
          accentColor={accentColor}
          durationInFrames={durationInFrames}
        />
      );

    case "stat_callout":
      return (
        <StatCallout
          value={visualCue.value}
          label={visualCue.label}
          direction={visualCue.direction}
          accentColor={accentColor}
          durationInFrames={durationInFrames}
        />
      );

    case "list_reveal":
      return (
        <ListReveal
          title={visualCue.title}
          items={visualCue.items}
          accentColor={accentColor}
          durationInFrames={durationInFrames}
        />
      );

    case "text_slide":
      return (
        <TextSlide
          text={visualCue.text}
          accentColor={accentColor}
          durationInFrames={durationInFrames}
        />
      );

    default:
      return (
        <TextSlide
          text={narration}
          accentColor={accentColor}
          durationInFrames={durationInFrames}
        />
      );
  }
};
