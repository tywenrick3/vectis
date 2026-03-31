import React from "react";
import type { CompositionProps } from "./Root";
import { NicheComposition } from "./NicheComposition";
import { THEMES } from "./visuals";

export const TechExplainer: React.FC<CompositionProps> = (props) => (
  <NicheComposition {...props} theme={THEMES["tech-explainer"]} />
);
