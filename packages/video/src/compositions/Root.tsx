import React from "react";
import { Composition } from "remotion";
import { TechExplainer } from "./TechExplainer.js";
import { FinanceEducation } from "./FinanceEducation.js";
import type { Script, VoiceAsset } from "@vectis/shared";

export interface CompositionProps {
  script: Script;
  voiceAsset: VoiceAsset;
}

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="TechExplainer"
        component={TechExplainer as unknown as React.ComponentType<Record<string, unknown>>}
        durationInFrames={30 * 60}
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
        durationInFrames={30 * 60}
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
