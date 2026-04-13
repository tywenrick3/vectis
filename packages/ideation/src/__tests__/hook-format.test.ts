import { describe, it, expect } from "vitest";
import { classifyHookFormat, type HookFormat } from "../hook-format.js";

describe("classifyHookFormat", () => {
  const cases: { hook: string; expected: HookFormat }[] = [
    // stat_callout — wins over number_led when both could match
    { hook: "90% of devs ship untested code", expected: "stat_callout" },
    { hook: "This one trick gives you 10x productivity", expected: "stat_callout" },
    { hook: "Earn $5 per sign-up in 2026", expected: "stat_callout" },

    // number_led
    { hook: "3 reasons your Rust code is slow", expected: "number_led" },
    { hook: "7 habits of senior engineers", expected: "number_led" },
    { hook: '"5 things I wish I knew"', expected: "number_led" },

    // question
    { hook: "Why is Rust so fast?", expected: "question" },
    { hook: "Should you learn Go in 2026?", expected: "question" },
    { hook: "Is TypeScript dying? Here's what the data says.", expected: "question" },

    // contrast
    { hook: "Nobody talks about this Postgres feature", expected: "contrast" },
    { hook: "Everyone thinks microservices scale. They don't.", expected: "contrast" },
    { hook: "Most people use Git wrong", expected: "contrast" },
    { hook: "You won't believe what OpenAI just shipped", expected: "contrast" },

    // claim
    { hook: "This is the best debugger you've never used", expected: "claim" },
    { hook: "Here's why your tests are slow", expected: "claim" },
    { hook: "The truth about AI coding assistants", expected: "claim" },
    { hook: "I built a startup in 24 hours", expected: "claim" },

    // other — fallback for unclassified openers
    { hook: "Vim just shipped native LSP support", expected: "other" },
    { hook: "Rust 1.80 dropped today", expected: "other" },

    // edge cases
    { hook: "", expected: "other" },
    { hook: "   ", expected: "other" },
  ];

  for (const { hook, expected } of cases) {
    it(`classifies "${hook}" as ${expected}`, () => {
      expect(classifyHookFormat(hook)).toBe(expected);
    });
  }
});
