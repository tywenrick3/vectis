import { describe, it, expect } from "vitest";
import type { Script } from "@vectis/shared";
import { extractScriptFeatures } from "../features.js";

function makeScript(overrides: Partial<Script> = {}): Script {
  return {
    id: "script-1",
    topic_id: "topic-1",
    hook: "",
    hook_variants: [],
    body: [],
    cta: "",
    full_text: "",
    caption: "",
    hashtags: [],
    estimated_duration_ms: 30000,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("extractScriptFeatures", () => {
  it("extracts features from a rich script with structured cues", () => {
    const script = makeScript({
      hook: "90% of devs ship untested code",
      body: [
        {
          narration: "In 2025, only 1 in 10 teams hit 80% coverage.",
          visual_cue: {
            type: "stat_callout",
            value: "10%",
            label: "coverage",
          },
          duration_estimate_ms: 5000,
          transition: "cut",
        },
        {
          narration: "The top 3 reasons are clear.",
          visual_cue: {
            type: "bar_chart",
            title: "reasons",
            bars: [{ label: "speed", value: 50 }],
          },
          duration_estimate_ms: 4000,
          transition: "zoom_in",
        },
        {
          narration: "Here is what great teams do differently.",
          visual_cue: {
            type: "list_reveal",
            items: ["test first", "type everything"],
          },
          duration_estimate_ms: 5000,
          transition: "cut",
        },
      ],
      cta: "Follow for more dev tips.",
    });

    const f = extractScriptFeatures(script);

    expect(f.hook_format).toBe("stat_callout");
    expect(f.segment_count).toBe(3);
    expect(f.word_count).toBeGreaterThan(20);
    expect(f.avg_segment_words).toBeGreaterThan(0);
    expect(f.visual_cue_types.sort()).toEqual([
      "bar_chart",
      "list_reveal",
      "stat_callout",
    ]);
    expect(f.visual_cue_variety).toBe(3);
    expect(f.transition_variety).toBe(2); // cut, zoom_in
    expect(f.specificity_density).toBeGreaterThan(0);
    expect(f.has_number_in_hook).toBe(true);
    expect(f.estimated_duration_ms).toBe(30000);
  });

  it("handles string visual cues as 'text'", () => {
    const script = makeScript({
      hook: "Rust is faster than you think",
      body: [
        {
          narration: "Compare GC languages head to head.",
          visual_cue: "some plain string cue",
          duration_estimate_ms: 3000,
          transition: "fade",
        },
      ],
      cta: "Subscribe.",
    });

    const f = extractScriptFeatures(script);
    expect(f.visual_cue_types).toEqual(["text"]);
    expect(f.visual_cue_variety).toBe(1);
    expect(f.has_number_in_hook).toBe(false);
    expect(f.hook_format).toBe("other");
  });

  it("handles empty body gracefully", () => {
    const script = makeScript({ hook: "Is Rust slow?", body: [], cta: "" });
    const f = extractScriptFeatures(script);
    expect(f.segment_count).toBe(0);
    expect(f.avg_segment_words).toBe(0);
    expect(f.visual_cue_variety).toBe(0);
    expect(f.transition_variety).toBe(0);
    expect(f.hook_format).toBe("question");
  });

  it("counts numbers for specificity density", () => {
    const script = makeScript({
      hook: "3 things",
      body: [
        {
          narration: "In 2025 about 42% of apps hit 10x speed.",
          visual_cue: "text",
          duration_estimate_ms: 5000,
          transition: "fade",
        },
      ],
      cta: "Follow.",
    });
    const f = extractScriptFeatures(script);
    // "3", "2025", "42%", "10x" → 4 numeric matches
    expect(f.specificity_density).toBeGreaterThan(20);
  });
});
