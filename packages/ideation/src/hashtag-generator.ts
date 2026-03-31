import Anthropic from "@anthropic-ai/sdk";
import { getEnv, createLogger } from "@vectis/shared";

const log = createLogger("ideation:hashtags");

export async function generateHashtags(
  title: string,
  niche: string,
  count: number = 20
): Promise<string[]> {
  const env = getEnv();
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  log.info({ title, niche }, "Generating hashtags");

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `Generate ${count} TikTok hashtags for a video titled "${title}" in the ${niche} niche. Mix high-volume trending tags with niche-specific ones. Return as JSON array of strings (without # prefix).`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  const hashtags: string[] = JSON.parse(text);

  log.info({ count: hashtags.length }, "Hashtags generated");
  return hashtags;
}
