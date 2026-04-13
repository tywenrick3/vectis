export type HookFormat =
  | "number_led"
  | "question"
  | "contrast"
  | "claim"
  | "stat_callout"
  | "other";

/**
 * Rule-based classifier for hook format. Runs at /record-run time and in the
 * backfill script — no LLM calls, deterministic. Ordering matters: more
 * specific patterns (stat_callout, number_led) are checked before broader ones.
 */
export function classifyHookFormat(hook: string): HookFormat {
  const raw = (hook ?? "").trim();
  if (!raw) return "other";

  // stat_callout: contains a percentage, dollar amount, or multiplier (e.g. "10x")
  if (/\d+\s*%|\$\s*\d|\b\d+x\b/i.test(raw)) return "stat_callout";

  // number_led: starts with a digit or currency symbol
  if (/^[\s"'“‘]*[$€£¥\d]/.test(raw)) return "number_led";

  // question: ends with a question mark (or has one in the first clause)
  if (raw.endsWith("?")) return "question";
  const firstClause = raw.split(/[.!]/)[0] ?? "";
  if (firstClause.includes("?")) return "question";

  // contrast: common subversive openers ("nobody knows", "everyone thinks", etc.)
  if (/^(nobody|no one|everyone|most people|most)\b/i.test(raw)) return "contrast";
  if (/^(you won't|you'll never|they don't want you to|they won't tell you)/i.test(raw))
    return "contrast";

  // claim: assertive/declarative openers
  if (/^(this|here's why|here is why|the reason|the truth|the real)\b/i.test(raw))
    return "claim";
  if (/^(i |we )\b/i.test(raw)) return "claim";

  return "other";
}
