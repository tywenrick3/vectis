export type HookFormat =
  | "number_led"
  | "question"
  | "contrast"
  | "claim"
  | "stat_callout"
  | "named_entity"
  | "other";

// Sentence-starter words that look capitalized but aren't named entities.
// Anything starting with one of these falls through to other classifiers.
const SENTENCE_STARTERS = new Set([
  "the", "a", "an",
  "this", "that", "these", "those",
  "i", "you", "we", "they", "he", "she", "it",
  "here", "there", "now", "today", "yesterday", "tomorrow",
  "why", "what", "how", "when", "where", "who", "which",
  "is", "are", "was", "were", "can", "could", "do", "does", "did",
  "should", "would", "will", "won't", "don't", "doesn't",
  "most", "every", "everyone", "nobody", "no",
  "imagine", "think", "listen", "look", "watch", "stop", "wait",
  "if", "but", "and", "or", "so", "because",
  "my", "your", "our", "their", "his", "her", "its",
  "ever", "never", "always",
]);

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

  // named_entity: hook starts with a proper noun (brand, product, org, person).
  // Must run after question/contrast/claim so generic capitalized openers
  // ("This", "Here") don't get misclassified.
  if (isNamedEntityStart(raw)) return "named_entity";

  return "other";
}

// "Tech news" verbs that often follow a brand/org subject in short-form hooks.
// We use these (plus version numbers and possessives) to disambiguate a real
// proper-noun opener from a common-word sentence starter.
const ACTION_VERBS = new Set([
  "just", "shipped", "dropped", "launched", "released", "announced", "added",
  "killed", "broke", "fixed", "hit", "reached", "made", "built", "created",
  "beat", "won", "lost", "said", "told", "claims", "wants", "needs", "says",
  "gets", "got", "raised", "acquired", "bought", "sold", "partnered",
  "integrated", "supports", "removed", "deprecated", "updated", "changed",
  "leaked", "exposed", "admitted", "revealed", "denied", "confirmed",
  "unveiled", "open-sourced", "open", "patched", "rewrote", "ported",
  "banned", "blocked", "rolled",
]);

function isNamedEntityStart(raw: string): boolean {
  // Strip leading quotes/whitespace before inspecting tokens
  const stripped = raw.replace(/^[\s"'“‘]+/, "");
  const tokens = stripped.split(/\s+/);
  const first = tokens[0] ?? "";
  if (!first) return false;

  // Acronyms: NASA, IBM, AWS, GPU, etc. (2+ uppercase letters at start)
  if (/^[A-Z]{2,}[a-z]?\b/.test(first)) return true;

  // Internal-caps brands: OpenAI, GitHub, TikTok, YouTube, iPhone, macOS, npm-style
  if (/^[A-Za-z][a-z]*[A-Z]/.test(first)) return true;

  // Generic proper noun: Capitalized first word + supporting signal.
  // Require the first token to start with an uppercase letter, NOT be a
  // sentence-starter stop word, and either (a) be a possessive ("Google's"),
  // (b) be followed by a version/number, or (c) be followed by a known
  // tech-news action verb. This keeps "Programming is hard" out while
  // catching "Vim just shipped..." and "Rust 1.80 dropped today".
  if (!/^[A-Z]/.test(first)) return false;
  const bareFirst = first.replace(/[’'].*$/, "").toLowerCase();
  if (SENTENCE_STARTERS.has(bareFirst)) return false;

  // Possessive: "Google's", "Apple's" — almost always a brand subject.
  if (/[’']s\b/.test(first)) return true;

  const second = tokens[1] ?? "";
  if (!second) return false;

  // Followed by a version or year ("Rust 1.80", "Python 3.12 hits")
  if (/^\d/.test(second)) return true;

  // Followed by a tech-news action verb
  const bareSecond = second.replace(/[.,!?;:]+$/, "").toLowerCase();
  if (ACTION_VERBS.has(bareSecond)) return true;

  return false;
}
