import Anthropic from "@anthropic-ai/sdk";
import { getEnv, getDb, createLogger, type Topic } from "@vectis/shared";

const log = createLogger("ideation:topics");

const SYSTEM_PROMPT = `You are a viral short-form content strategist. Generate unique, engaging topic ideas for educational vertical videos (TikTok/Shorts/Reels). Each topic should be specific enough to explain in 30-60 seconds while being broadly appealing. Return JSON only.`;

interface TopicSuggestion {
  title: string;
  description: string;
}

export async function generateTopics(
  niche: string,
  count: number = 7
): Promise<Topic[]> {
  const env = getEnv();
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const db = getDb();

  log.info({ niche, count }, "Generating topics");

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Generate ${count} viral topic ideas for the "${niche}" niche. Return as JSON array: [{"title": "...", "description": "..."}]`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  const suggestions: TopicSuggestion[] = JSON.parse(text);

  const rows = suggestions.map((s) => ({
    niche,
    title: s.title,
    description: s.description,
    score: 0,
    used: false,
  }));

  const { data, error } = await db
    .from("topics")
    .insert(rows)
    .select();

  if (error) throw new Error(`Failed to insert topics: ${error.message}`);

  log.info({ count: data.length }, "Topics generated");
  return data as Topic[];
}
