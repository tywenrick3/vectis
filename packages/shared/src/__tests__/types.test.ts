import { describe, it, expect } from "vitest";
import { isStructuredCue, type VisualCue } from "../types.js";

describe("isStructuredCue", () => {
  it("returns true for an animated_counter cue", () => {
    const cue: VisualCue = {
      type: "animated_counter",
      value: 42,
      label: "Users",
    };
    expect(isStructuredCue(cue)).toBe(true);
  });

  it("returns true for a bar_chart cue", () => {
    const cue: VisualCue = {
      type: "bar_chart",
      title: "Revenue",
      bars: [{ label: "Q1", value: 100 }],
    };
    expect(isStructuredCue(cue)).toBe(true);
  });

  it("returns true for a comparison cue", () => {
    const cue: VisualCue = {
      type: "comparison",
      left: { name: "A", specs: [{ label: "Speed", value: "Fast" }] },
      right: { name: "B", specs: [{ label: "Speed", value: "Slow" }] },
    };
    expect(isStructuredCue(cue)).toBe(true);
  });

  it("returns true for a stat_callout cue", () => {
    const cue: VisualCue = {
      type: "stat_callout",
      value: "3.2B",
      label: "Daily searches",
      direction: "up",
    };
    expect(isStructuredCue(cue)).toBe(true);
  });

  it("returns true for a list_reveal cue", () => {
    const cue: VisualCue = {
      type: "list_reveal",
      items: ["First", "Second"],
    };
    expect(isStructuredCue(cue)).toBe(true);
  });

  it("returns true for a text_slide cue", () => {
    const cue: VisualCue = { type: "text_slide", text: "Hello world" };
    expect(isStructuredCue(cue)).toBe(true);
  });

  it("returns false for a plain string", () => {
    expect(isStructuredCue("Show a diagram")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isStructuredCue("")).toBe(false);
  });
});
