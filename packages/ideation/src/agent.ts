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

const MAX_ITERATIONS = 20;

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
      "Extract content from a specific URL using Tavily. Returns raw content — prefer firecrawl_scrape for cleaner, richer results.",
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
    name: "firecrawl_scrape",
    description:
      "Scrape a URL and get clean, readable markdown content. Use this to deeply read articles, blog posts, or data pages. Returns richer content than tavily_extract — prefer this for detailed research.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "The URL to scrape",
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
    name: "check_uniqueness",
    description:
      "Check if a proposed topic title is too similar to recently published topics. Returns similar past titles. If the list is non-empty, pick a different angle.",
    input_schema: {
      type: "object" as const,
      properties: {
        proposed_title: {
          type: "string",
          description: "The topic title you want to check for uniqueness",
        },
        niche: {
          type: "string",
          description: "The niche to check against",
        },
      },
      required: ["proposed_title", "niche"],
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
        hook_variants: {
          type: "array",
          items: { type: "string" },
          description:
            "2-3 alternative opening hooks for A/B testing. Each must be a different angle/format from the primary hook — e.g. a number-led hook, a bold claim hook, a contrast hook.",
        },
        body: {
          type: "array",
          items: {
            type: "object",
            properties: {
              narration: { type: "string" },
              visual_cue: {
                description:
                  "Structured visual cue object with a type field (animated_counter, bar_chart, comparison, stat_callout, list_reveal, text_slide). See system prompt for schemas.",
              },
              duration_estimate_ms: { type: "number" },
            },
            required: ["narration", "visual_cue", "duration_estimate_ms"],
          },
          description: "Script body segments with structured visual cues",
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
        "hook_variants",
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
    case "firecrawl_scrape": {
      const { scrape } = await import("@vectis/research");
      const result = await scrape(input.url as string);
      return JSON.stringify(result);
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
    case "check_uniqueness": {
      const db = getDb();
      const { data: recent } = await db
        .from("topics")
        .select("title, description, created_at")
        .eq("niche", input.niche as string)
        .eq("used", true)
        .order("created_at", { ascending: false })
        .limit(30);

      if (!recent || recent.length === 0) {
        return JSON.stringify({ similar: [], message: "No prior topics found. You're clear." });
      }

      const proposed = (input.proposed_title as string).toLowerCase();
      const proposedWords = new Set(proposed.split(/\s+/).filter(w => w.length > 3));

      const similar = recent.filter((t: { title: string }) => {
        const titleWords = new Set(t.title.toLowerCase().split(/\s+/).filter(w => w.length > 3));
        const overlap = [...proposedWords].filter(w => titleWords.has(w)).length;
        return overlap >= 2;
      });

      return JSON.stringify({
        similar: similar.map((t: { title: string; created_at: string }) => ({
          title: t.title,
          created_at: t.created_at,
        })),
        message: similar.length > 0
          ? `Found ${similar.length} similar past topics. Choose a more distinct angle.`
          : "No similar topics found. This angle is fresh.",
      });
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
1. FIRST: Call score_lookup to review past topic performance — this is MANDATORY before choosing any angle
2. Review the research brief carefully — study top_performers (winning patterns), low_performers (avoid these), recently_covered (already published), and saturation_signals (played out)
3. Identify the best angle — find a gap or fresh take that ALIGNS with patterns from top-performing topics
4. If needed, search deeper on your chosen angle using tavily_search to find URLs, then firecrawl_scrape to deeply read promising pages (prefer firecrawl_scrape over tavily_extract for richer content)
5. Write a compelling topic + script (hook → body → CTA)
6. Use check_uniqueness to verify your topic hasn't been covered before
7. Self-critique: Is the hook strong enough? Does it contain a concrete fact? Does it align with what performed well? If not, revise.
8. Generate hashtags and a caption
9. Submit the final content using the submit_content tool

## PERFORMANCE-INFORMED DECISIONS (MANDATORY)

You MUST call score_lookup before choosing your angle. This is not optional.

The research brief includes top_performers and low_performers with actual metrics:
- score: 0-100 composite engagement score. Higher = better.
- Topics 70+ = WINNING patterns. Create content in a similar vein (same format, similar specificity, related themes).
- Topics below 30 = UNDERPERFORMERS. Avoid similar angles.
- High comments relative to views = the topic sparked discussion. Lean into controversial/surprising angles.

If score_lookup returns no data or performance arrays are empty, this niche has no history yet — rely on research data and interestingness criteria.

## INTERESTINGNESS CRITERIA — Apply these to every topic idea

PREFER topics that have:
- A specific, named event, product, person, or company (not "AI" but "Claude Code", not "crypto" but "Solana's outage")
- A concrete number, date, or data point in the hook (not "millions" but "347 million")
- A leak, behind-the-scenes revelation, or "I bet you didn't know" fact
- A surprising reversal or counterintuitive finding ("X was supposed to Y, but actually Z")
- A recency anchor — something that happened THIS week, not a timeless trend

REJECT topics that are:
- Broad trend commentary ("AI is changing everything", "The future of work", "How agents will transform X")
- Vague futures with no concrete evidence ("X will transform Y by 2030")
- Generic listicles ("5 ways to...", "Top 10...")
- Already covered — check recently_covered in the brief and use check_uniqueness before submitting

HOOK RULE: The hook MUST contain a concrete fact, specific number, or named entity. Rhetorical questions alone ("Did you know...?", "What if I told you...?") are NOT acceptable hooks.
Good: "NASA just mass-deleted their entire moon base blueprint — and rebuilt it in 6 weeks."
Bad: "What if we could live on the moon someday?"

## HOOK VARIANTS (REQUIRED)

Generate 2-3 alternative hooks in hook_variants. Each variant must:
- Use a DIFFERENT angle or format from the primary hook
- Still follow the hook rule (concrete fact, specific number, or named entity)
- Be roughly the same length (2-3 seconds spoken)

Vary the approach across variants. Example strategies:
- Number-led: "347 million passwords were just leaked..."
- Bold claim: "Your phone is lying to you about battery health."
- Contrast/reversal: "Google spent $30B on AI — and it made search worse."
- Consequence: "If you're still using SMS, your bank account is exposed."

The primary hook should be your strongest. Variants are for A/B testing.

IMPORTANT:
- Avoid angles listed in saturation_signals — those are played out
- NEVER repeat topics from recently_covered — those have already been published
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
      model: "claude-opus-4-6",
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

  // Normalize visual_cue: ensure objects have a valid type field
  if (Array.isArray(submitted.body)) {
    for (const segment of submitted.body as Record<string, unknown>[]) {
      if (typeof segment.visual_cue === "object" && segment.visual_cue !== null) {
        const cue = segment.visual_cue as Record<string, unknown>;
        if (!cue.type) {
          segment.visual_cue = { type: "text_slide", text: segment.narration as string };
        }
      }
    }
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
      hook_variants: (submitted.hook_variants as string[]) ?? [],
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
