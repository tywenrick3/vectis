import type { Script } from "@vectis/shared";
import { isStructuredCue } from "@vectis/shared";
import { classifyHookFormat, type HookFormat } from "./hook-format.js";

export interface ScriptFeatures {
  hook_format: HookFormat;
  segment_count: number;
  word_count: number;
  avg_segment_words: number;
  visual_cue_types: string[];
  visual_cue_variety: number;
  transition_variety: number;
  specificity_density: number; // numbers per 100 words
  has_number_in_hook: boolean;
  estimated_duration_ms: number;
}

/**
 * Extracts structural features from a script for downstream craft analysis.
 * Pure function, no I/O. Called at ideation-submit time and in the backfill.
 */
export function extractScriptFeatures(script: Script): ScriptFeatures {
  const hook = script.hook ?? "";
  const body = script.body ?? [];
  const cta = script.cta ?? "";

  const allText = [hook, ...body.map((s) => s.narration ?? ""), cta]
    .join(" ")
    .trim();

  const words = allText.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // Numbers: integers, decimals, percentages, dollar amounts, multipliers
  const numbers = allText.match(/\b\d+(?:\.\d+)?%?\b|\$\s*\d+|\b\d+x\b/gi) ?? [];
  const specificityDensity =
    wordCount > 0 ? (numbers.length * 100) / wordCount : 0;

  // Visual cue types: structured cues expose a `type` field; string cues get "text"
  const cueTypes = body.map((seg) => {
    if (isStructuredCue(seg.visual_cue)) return seg.visual_cue.type;
    return "text";
  });
  const uniqueCues = [...new Set(cueTypes)];

  const transitions = body
    .map((seg) => seg.transition)
    .filter((t): t is NonNullable<typeof t> => !!t);
  const uniqueTransitions = new Set(transitions);

  return {
    hook_format: classifyHookFormat(hook),
    segment_count: body.length,
    word_count: wordCount,
    avg_segment_words:
      body.length > 0 ? Math.round((wordCount / body.length) * 10) / 10 : 0,
    visual_cue_types: uniqueCues,
    visual_cue_variety: uniqueCues.length,
    transition_variety: uniqueTransitions.size,
    specificity_density: Math.round(specificityDensity * 100) / 100,
    has_number_in_hook: /\d/.test(hook),
    estimated_duration_ms: script.estimated_duration_ms ?? 0,
  };
}
