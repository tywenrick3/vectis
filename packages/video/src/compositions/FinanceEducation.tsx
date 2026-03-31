import React from "react";
import type { CompositionProps } from "./Root";
import { NicheComposition } from "./NicheComposition";
import { THEMES } from "./visuals";

export const FinanceEducation: React.FC<CompositionProps> = (props) => (
  <NicheComposition
    {...props}
    theme={THEMES["finance-education"]}
    disclaimer="Educational content only — not financial advice"
  />
);
