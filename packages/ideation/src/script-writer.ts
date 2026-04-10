import Anthropic from "@anthropic-ai/sdk";
import { getEnv, getDb, createLogger, MODELS, type Script, type Topic } from "@vectis/shared";
import { NICHE_PROMPTS } from "./prompts/index.js";

const log = createLogger("ideation:script");

export async function writeScript(topic: Topic): Promise<Script> {
  const env = getEnv();
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const db = getDb();

  const nichePrompt = NICHE_PROMPTS[topic.niche] ?? NICHE_PROMPTS["tech-explainer"];

  log.info({ topicId: topic.id, title: topic.title }, "Writing script");

  const response = await client.messages.create({
    model: MODELS.scriptWriter,
    max_tokens: 2048,
    system: nichePrompt,
    messages: [
      {
        role: "user",
        content: `Write a 45-65 second vertical video script for: "${topic.title}" — ${topic.description}

Return JSON:
{
  "hook": "opening line that grabs attention (2-3 seconds)",
  "hook_variants": ["alternative hook 1 (different angle)", "alternative hook 2 (different angle)"],
  "body": [
    {
      "narration": "what to say",
      "visual_cue": {"type": "animated_counter", "value": 1000000, "prefix": "$", "suffix": "", "label": "description"},
      "duration_estimate_ms": 5000,
      "transition": "zoom_in"
    }
  ],
  "cta": "closing call to action",
  "caption": "post caption for TikTok",
  "hashtags": ["tag1", "tag2"]
}

hook_variants: 2-3 alternative hooks for A/B testing. Each must use a different angle (number-led, bold claim, contrast, consequence) from the primary hook.

visual_cue must be a JSON object. Available types: animated_counter, bar_chart, comparison, stat_callout, list_reveal, text_slide, pie_chart, timeline. See system prompt for full schemas.

transition: one of "fade", "cut", "zoom_in", "slide_left", "smash". Vary across segments — see system prompt for guidance.`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  const parsed = JSON.parse(text);

  // Normalize visual_cue and transition fields
  const validTransitions = new Set(["fade", "cut", "zoom_in", "slide_left", "smash"]);
  if (Array.isArray(parsed.body)) {
    for (const segment of parsed.body) {
      if (typeof segment.visual_cue === "object" && segment.visual_cue !== null) {
        if (!segment.visual_cue.type) {
          segment.visual_cue = { type: "text_slide", text: segment.narration };
        }
      }
      if (!segment.transition || !validTransitions.has(segment.transition)) {
        segment.transition = "fade";
      }
    }
  }

  const fullText = [
    parsed.hook,
    ...parsed.body.map((s: { narration: string }) => s.narration),
    parsed.cta,
  ].join(" ");

  const estimatedDuration = parsed.body.reduce(
    (sum: number, s: { duration_estimate_ms: number }) =>
      sum + s.duration_estimate_ms,
    3000 + 3000 // hook + cta buffer
  );

  const { data, error } = await db
    .from("scripts")
    .insert({
      topic_id: topic.id,
      hook: parsed.hook,
      hook_variants: parsed.hook_variants ?? [],
      body: parsed.body,
      cta: parsed.cta,
      full_text: fullText,
      caption: parsed.caption,
      hashtags: parsed.hashtags,
      estimated_duration_ms: estimatedDuration,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to insert script: ${error.message}`);

  // Mark topic as used
  await db.from("topics").update({ used: true }).eq("id", topic.id);

  log.info({ scriptId: data.id }, "Script written");
  return data as Script;
}
