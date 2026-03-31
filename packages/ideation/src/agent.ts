import Anthropic from "@anthropic-ai/sdk";
import {
  getEnv,
  getDb,
  createLogger,
  type Topic,
  type Script,
  type ResearchBrief,
} from "@vectis/shared";
import { NICHE_PROMPTS } from "./prompts/index.js";

const log = createLogger("ideation:agent");

const MAX_ITERATIONS = 5;

// Tool definitions for the agent
const TOOLS: Anthropic.Tool[] = [
  {
    name: "tavily_search",
    description:
      "Search the web for specific information. Use this for targeted follow-up searches when you need more detail on a specific angle or topic.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "The search query",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "tavily_extract",
    description:
      "Extract content from a specific URL. Use this to pull detailed information from a page you found via search.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "The URL to extract content from",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "score_lookup",
    description:
      "Look up past topic performance scores for a given niche. Returns top-performing topics and their scores to help you pick winning angles.",
    input_schema: {
      type: "object" as const,
      properties: {
        niche: {
          type: "string",
          description: "The niche to look up scores for",
        },
        limit: {
          type: "number",
          description: "Number of top topics to return (default 10)",
        },
      },
      required: ["niche"],
    },
  },
  {
    name: "submit_content",
    description:
      "Submit the final topic and script. Call this when you are satisfied with the content quality.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: {
          type: "string",
          description: "The video topic title",
        },
        description: {
          type: "string",
          description: "Brief description of the topic angle",
        },
        hook: {
          type: "string",
          description:
            "Opening line that grabs attention (2-3 seconds when spoken)",
        },
        body: {
          type: "array",
          items: {
            type: "object",
            properties: {
              narration: { type: "string" },
              visual_cue: { type: "string" },
              duration_estimate_ms: { type: "number" },
            },
            required: ["narration", "visual_cue", "duration_estimate_ms"],
          },
          description: "Script body segments",
        },
        cta: {
          type: "string",
          description: "Closing call to action",
        },
        caption: {
          type: "string",
          description: "Post caption for social media",
        },
        hashtags: {
          type: "array",
          items: { type: "string" },
          description: "Hashtags without # prefix",
        },
      },
      required: [
        "title",
        "description",
        "hook",
        "body",
        "cta",
        "caption",
        "hashtags",
      ],
    },
  },
];

// Tool handlers
async function handleToolCall(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  switch (name) {
    case "tavily_search": {
      // Dynamic import to avoid hard dependency when research package isn't installed
      const { search } = await import("@vectis/research");
      const results = await search(input.query as string, 5);
      return JSON.stringify(results);
    }
    case "tavily_extract": {
      const { extract } = await import("@vectis/research");
      const results = await extract([input.url as string]);
      return JSON.stringify(results);
    }
    case "score_lookup": {
      const db = getDb();
      const limit = (input.limit as number) ?? 10;
      const { data } = await db
        .from("topics")
        .select("title, description, score, niche")
        .eq("niche", input.niche as string)
        .eq("used", true)
        .order("score", { ascending: false })
        .limit(limit);
      return JSON.stringify(data ?? []);
    }
    case "submit_content": {
      // This is handled by the caller, not here
      return JSON.stringify({ status: "submitted" });
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

interface AgentResult {
  topic: Topic;
  script: Script;
}

export async function runIdeationAgent(
  brief: ResearchBrief
): Promise<AgentResult> {
  const env = getEnv();
  const db = getDb();
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const nichePrompt =
    NICHE_PROMPTS[brief.niche] ?? NICHE_PROMPTS["tech-explainer"];

  const systemPrompt = `${nichePrompt}

You are an ideation agent for a short-form video content pipeline. You have been given a research brief with trending topics, news, competitor angles, and saturation signals for the "${brief.niche}" niche.

Your job:
1. Review the research brief carefully
2. Identify the best angle — find a gap in what competitors are covering, or a fresh take on a trending topic
3. If needed, search deeper on your chosen angle using tavily_search or tavily_extract
4. Use score_lookup to check what topics have performed well in the past
5. Write a compelling topic + script (hook → body → CTA)
6. Self-critique: Is the hook strong enough? Would YOU stop scrolling for this? If not, revise.
7. Generate hashtags and a caption
8. Submit the final content using the submit_content tool

IMPORTANT:
- The hook MUST create curiosity or surprise in the first 2-3 seconds
- Avoid angles listed in saturation_signals — those are played out
- Total script should be 30-60 seconds when read aloud (~150 words/minute)
- You MUST call submit_content to complete your task`;

  const userMessage = `Here is the research brief for the "${brief.niche}" niche:

${JSON.stringify(brief, null, 2)}

Analyze this research and create the best possible short-form video content. Use your tools to validate your angle and check past performance before submitting.`;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  let submitted: Record<string, unknown> | null = null;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    log.info({ iteration, niche: brief.niche }, "Agent iteration");

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    });

    // Collect all text and tool_use blocks
    const assistantContent = response.content;
    messages.push({ role: "assistant", content: assistantContent });

    // If no tool use, the agent is done thinking
    if (response.stop_reason === "end_turn") {
      log.warn("Agent ended without submitting — forcing completion");
      break;
    }

    // Process tool calls
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of assistantContent) {
      if (block.type !== "tool_use") continue;

      if (block.name === "submit_content") {
        submitted = block.input as Record<string, unknown>;
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify({ status: "submitted" }),
        });
        continue;
      }

      const result = await handleToolCall(
        block.name,
        block.input as Record<string, unknown>
      );
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result,
      });
    }

    messages.push({ role: "user", content: toolResults });

    // If content was submitted, we're done
    if (submitted) break;
  }

  if (!submitted) {
    throw new Error("Ideation agent failed to submit content within iteration limit");
  }

  // Store topic
  const { data: topic, error: topicError } = await db
    .from("topics")
    .insert({
      niche: brief.niche,
      title: submitted.title as string,
      description: submitted.description as string,
      score: 0,
      used: true,
    })
    .select()
    .single();

  if (topicError) throw new Error(`Failed to insert topic: ${topicError.message}`);

  // Store script
  const body = submitted.body as { narration: string; duration_estimate_ms: number }[];
  const fullText = [
    submitted.hook as string,
    ...body.map((s) => s.narration),
    submitted.cta as string,
  ].join(" ");

  const estimatedDuration = body.reduce(
    (sum, s) => sum + s.duration_estimate_ms,
    3000 + 3000 // hook + cta buffer
  );

  const { data: script, error: scriptError } = await db
    .from("scripts")
    .insert({
      topic_id: topic.id,
      hook: submitted.hook as string,
      body: submitted.body,
      cta: submitted.cta as string,
      full_text: fullText,
      caption: submitted.caption as string,
      hashtags: submitted.hashtags as string[],
      estimated_duration_ms: estimatedDuration,
    })
    .select()
    .single();

  if (scriptError) throw new Error(`Failed to insert script: ${scriptError.message}`);

  log.info(
    { topicId: topic.id, scriptId: script.id, title: topic.title },
    "Ideation agent complete"
  );

  return {
    topic: topic as Topic,
    script: script as Script,
  };
}
