import React from "react";
import { Composition } from "remotion";
import { TechExplainer } from "./TechExplainer";
import { FinanceEducation } from "./FinanceEducation";
import type { Script, VoiceAsset, TranscriptionWord } from "@vectis/shared";

export interface BackgroundClip {
  url: string;
  startSec: number;
  durationSec: number;
}

export interface CompositionProps {
  script: Script;
  voiceAsset: VoiceAsset;
  captionWords?: TranscriptionWord[];
  hookOverride?: string;
  backgroundClip?: BackgroundClip | null;
}

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="TechExplainer"
        component={TechExplainer as unknown as React.ComponentType<Record<string, unknown>>}
        durationInFrames={30 * 65}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          script: {} as Script,
          voiceAsset: {} as VoiceAsset,
        }}
      />
      <Composition
        id="FinanceEducation"
        component={FinanceEducation as unknown as React.ComponentType<Record<string, unknown>>}
        durationInFrames={30 * 65}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          script: {} as Script,
          voiceAsset: {} as VoiceAsset,
        }}
      />
    </>
  );
};
