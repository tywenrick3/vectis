import Anthropic from "@anthropic-ai/sdk";
import { getEnv, getDb, createLogger, type Script, type Topic } from "@vectis/shared";
import { NICHE_PROMPTS } from "./prompts/index.js";

const log = createLogger("ideation:script");

export async function writeScript(topic: Topic): Promise<Script> {
  const env = getEnv();
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const db = getDb();

  const nichePrompt = NICHE_PROMPTS[topic.niche] ?? NICHE_PROMPTS["tech-explainer"];

  log.info({ topicId: topic.id, title: topic.title }, "Writing script");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: nichePrompt,
    messages: [
      {
        role: "user",
        content: `Write a 30-60 second vertical video script for: "${topic.title}" — ${topic.description}

Return JSON:
{
  "hook": "opening line that grabs attention (2-3 seconds)",
  "body": [{"narration": "what to say", "visual_cue": "what to show on screen", "duration_estimate_ms": 5000}],
  "cta": "closing call to action",
  "caption": "post caption for TikTok",
  "hashtags": ["tag1", "tag2"]
}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  const parsed = JSON.parse(text);

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
