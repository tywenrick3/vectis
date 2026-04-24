import React from "react";
import { AbsoluteFill } from "remotion";
import { isStructuredCue, type VisualCue } from "@vectis/shared";
import { AnimatedCounter } from "./AnimatedCounter";
import { BarChart } from "./BarChart";
import { ComparisonCard } from "./ComparisonCard";
import { StatCallout } from "./StatCallout";
import { ListReveal } from "./ListReveal";
import { TextSlide } from "./TextSlide";
import { PieChart } from "./PieChart";
import { Timeline } from "./Timeline";
import { Panel } from "./Panel";

interface SegmentRendererProps {
  visualCue: string | VisualCue;
  narration: string;
  accentColor: string;
  panelBg: string;
  durationInFrames: number;
}

// Body cue layout:
//   - top-third anchored (gameplay owns the middle and bottom of the frame)
//   - full-frame centered only for TextSlide / legacy fallback (narrative emphasis)
//   - panel wrap only for ComparisonCard (naturally wide/tabular — fills the chip)
const TopSlot: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={{
      justifyContent: "flex-start",
      alignItems: "center",
      paddingTop: 170,
      paddingLeft: 60,
      paddingRight: 60,
    }}
  >
    {children}
  </AbsoluteFill>
);

const CenterSlot: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={{
      justifyContent: "center",
      alignItems: "center",
      padding: "60px 50px",
    }}
  >
    {children}
  </AbsoluteFill>
);

export const SegmentRenderer: React.FC<SegmentRendererProps> = ({
  visualCue,
  narration,
  accentColor,
  panelBg,
  durationInFrames,
}) => {
  // Legacy string cues → centered TextSlide
  if (!isStructuredCue(visualCue)) {
    return (
      <CenterSlot>
        <TextSlide
          text={visualCue || narration}
          accentColor={accentColor}
          durationInFrames={durationInFrames}
        />
      </CenterSlot>
    );
  }

  switch (visualCue.type) {
    case "text_slide":
      return (
        <CenterSlot>
          <TextSlide
            text={visualCue.text}
            accentColor={accentColor}
            durationInFrames={durationInFrames}
          />
        </CenterSlot>
      );

    case "animated_counter":
      return (
        <TopSlot>
          <AnimatedCounter
            value={visualCue.value}
            prefix={visualCue.prefix}
            suffix={visualCue.suffix}
            label={visualCue.label}
            accentColor={accentColor}
            durationInFrames={durationInFrames}
          />
        </TopSlot>
      );

    case "stat_callout":
      return (
        <TopSlot>
          <StatCallout
            value={visualCue.value}
            label={visualCue.label}
            direction={visualCue.direction}
            accentColor={accentColor}
            durationInFrames={durationInFrames}
          />
        </TopSlot>
      );

    case "pie_chart":
      return (
        <TopSlot>
          <PieChart
            title={visualCue.title}
            value={visualCue.value}
            label={visualCue.label}
            color={visualCue.color}
            accentColor={accentColor}
            durationInFrames={durationInFrames}
          />
        </TopSlot>
      );

    case "bar_chart":
      return (
        <TopSlot>
          <BarChart
            title={visualCue.title}
            bars={visualCue.bars}
            unit={visualCue.unit}
            accentColor={accentColor}
            durationInFrames={durationInFrames}
          />
        </TopSlot>
      );

    case "list_reveal":
      return (
        <TopSlot>
          <ListReveal
            title={visualCue.title}
            items={visualCue.items}
            accentColor={accentColor}
            durationInFrames={durationInFrames}
          />
        </TopSlot>
      );

    case "timeline":
      return (
        <TopSlot>
          <Timeline
            title={visualCue.title}
            events={visualCue.events}
            accentColor={accentColor}
            durationInFrames={durationInFrames}
          />
        </TopSlot>
      );

    case "comparison":
      return (
        <TopSlot>
          <Panel accentColor={accentColor} panelBg={panelBg}>
            <ComparisonCard
              left={visualCue.left}
              right={visualCue.right}
              accentColor={accentColor}
              durationInFrames={durationInFrames}
            />
          </Panel>
        </TopSlot>
      );

    default:
      return (
        <CenterSlot>
          <TextSlide
            text={narration}
            accentColor={accentColor}
            durationInFrames={durationInFrames}
          />
        </CenterSlot>
      );
  }
};
