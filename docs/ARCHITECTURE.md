# Vectis — AI Content Pipeline Architecture

> End-to-end automated pipeline: **trigger → research → ideation (agent) → generation → assembly → publish → analyze → repeat**

## Pipeline Overview

```
┌─────────┐   ┌──────────┐   ┌───────────────────┐   ┌────────────┐   ┌──────────┐   ┌─────────┐   ┌───────────┐
│ TRIGGER  │──▸│ RESEARCH │──▸│ IDEATION (agent)  │──▸│ GENERATION │──▸│ ASSEMBLY │──▸│ PUBLISH │──▸│ ANALYTICS │
└─────────┘   └──────────┘   └───────────────────┘   └────────────┘   └──────────┘   └─────────┘   └───────────┘
     ▴              │                  │                                                                   │
     │              │    Tavily tool ◂─┘                                                                   │
     │              │    (on-demand deep dives)                                                             │
     │              │                                                                                      │
     └──────────────┴─────────────────── FEEDBACK LOOP ◂──────────────────────────────────────────────────┘
```

## Orchestrator

**n8n** (self-hosted) manages the entire pipeline. Each layer is a node group. Cron triggers fire daily. Error handling and retries are built in. Webhook nodes receive analytics callbacks. LLM nodes can be swapped between Claude / DeepSeek / GPT depending on cost-quality tradeoffs per stage.

---

## 1. Trigger — Input Sources

| Source           | Description                          | Tool                          |
|------------------|--------------------------------------|-------------------------------|
| Cron Schedule    | Automated daily/weekly cadence       | n8n Cron Node                 |
| Trend Signal     | Trending topics & sounds detected    | TikTok Creative Center / BuzzSumo |
| Content Calendar | Planned topics from data store       | Supabase                      |

## 2. Research — Web Intelligence (NEW)

The research stage runs **before** ideation to gather fresh, real-time context. It performs structured, parallelizable searches and outputs a `ResearchBrief` — a JSON document that gives the ideation agent grounded, current information to work with instead of relying solely on LLM training data.

| Component            | Description                                         | Tool           |
|----------------------|-----------------------------------------------------|----------------|
| Trending Topic Scan  | What's trending in the niche right now               | Tavily Search  |
| News & Current Events| Recent news relevant to tech/finance niches          | Tavily Search  |
| Competitor Analysis  | What top creators are posting, angles being used     | Tavily Search  |
| Saturation Check     | How crowded is a topic — avoid making the same video | Tavily Search  |
| Source Material       | Articles, data points, quotes to reference in script | Tavily Extract |

**Output: `ResearchBrief`**
```typescript
{
  niche: string;                    // "tech_explainer" | "finance_education"
  trending_topics: TrendingTopic[]; // title, source, velocity, freshness
  recent_news: NewsItem[];          // headline, summary, url, published_at
  competitor_angles: string[];      // what angles are already saturated
  saturation_signals: string[];     // topics to avoid
  source_material: SourceItem[];    // citable facts, stats, quotes
  searched_at: string;              // ISO timestamp
}
```

**Why a separate stage (not just agent tools):**
- Structured searches are cheap, fast, and parallelizable (run all 5 search types at once)
- Predictable cost — fixed number of Tavily calls per run
- Research brief is cached in Supabase for debugging and reuse
- The agent loop in Ideation can still call Tavily for targeted follow-ups, but the broad sweep is already done

## 3. Ideation — Agent Loop (UPGRADED)

Ideation is now an **agentic loop** — Claude with tool access, not a single prompt-in/script-out call. It receives the research brief as context and can reason iteratively about what to create.

```
┌─────────────────────────────────────────────────────┐
│  IDEATION AGENT                                     │
│                                                     │
│  Context: ResearchBrief + niche prompts + history   │
│                                                     │
│  Tools available:                                   │
│  ├─ tavily_search  (targeted follow-up searches)    │
│  ├─ tavily_extract (pull specific page content)     │
│  └─ score_lookup   (check past topic performance)   │
│                                                     │
│  Agent loop:                                        │
│  1. Review research brief                           │
│  2. Identify best angle (gap in saturation)         │
│  3. Optional: search deeper on chosen angle         │
│  4. Generate topic + script (hook → body → CTA)     │
│  5. Self-critique: is the hook strong enough?        │
│  6. Generate hashtags & SEO tags                    │
│  7. Return final Topic + Script                     │
└─────────────────────────────────────────────────────┘
```

| Component       | Description                                      | Tool                                |
|-----------------|--------------------------------------------------|-------------------------------------|
| Topic Selection | Pick angle based on research + gap analysis       | Claude agent + ResearchBrief        |
| Deep Dive       | Optional targeted search when agent spots a lead  | Tavily Search (tool_use)            |
| Script Writer   | Hook → body segments → CTA, informed by sources   | Claude agent (system prompt tuned)  |
| Self-Critique   | Agent evaluates hook strength, rewrites if weak    | Claude agent (internal reasoning)   |
| Hashtag & SEO   | Platform-specific tags based on trending data      | Claude agent + trending data        |

**Why an agent loop here (and nowhere else in MVP):**
- Ideation is the one stage where **judgment and adaptation** matter most
- A fixed prompt can't decide "this angle is oversaturated, pivot to X"
- The agent can self-critique and iterate on hook quality before committing
- Cost is bounded: research brief handles the broad sweep, agent only does targeted follow-ups (typically 0-2 extra Tavily calls)
- All other stages (generation, assembly, publish) are deterministic — they execute a plan, they don't make creative decisions

## 4. Generation — Asset Creation

| Component       | Description                          | Tool                          |
|-----------------|--------------------------------------|-------------------------------|
| Voice Synthesis | Clone voice or use preset            | ElevenLabs API                |
| Visual Render   | Programmatic video from script       | Remotion (React + TS)         |
| AI Video Gen    | Cinematic / faceless clips           | Kling / Veo 3.1 / Runway     |
| Image Gen       | Thumbnails, overlays, B-roll         | FLUX / Midjourney API         |

## 5. Assembly — Post-Processing

| Component       | Description                          | Tool                          |
|-----------------|--------------------------------------|-------------------------------|
| Video Compose   | Stitch audio + visuals + captions    | FFmpeg / Remotion render      |
| Auto-Caption    | Transcribe & style subtitles         | Whisper + FFmpeg burn-in      |
| Multi-Format    | 9:16, 16:9, 1:1, 4:5 variants       | FFmpeg aspect ratio pipeline  |
| A/B Variants    | Hook & CTA permutations              | n8n loop + LLM rewrites      |

## 6. Publish — Distribution

| Platform         | Description                         | Tool                          |
|------------------|-------------------------------------|-------------------------------|
| YouTube Shorts   | MVP target — instant API access, real ad revenue | YouTube Data API v3  |
| TikTok           | Post-MVP — requires app review      | Content Posting API v2        |
| Instagram Reels  | Post-MVP — requires app review      | Instagram Graph API           |
| Buffer / Blotato | Scheduling & queue management       | Multi-platform scheduler      |

## 7. Analytics — Feedback Loop

| Component         | Description                        | Tool                          |
|-------------------|------------------------------------|-------------------------------|
| Performance Ingest| Views, watch time, engagement      | Platform Analytics APIs       |
| Revenue Tracking  | CPM, affiliate, brand deals        | Custom dashboard / Supabase   |
| Model Tuning      | Feed winning patterns back to LLM  | n8n → prompt template update  |

Analytics data feeds back into the Trigger & Ideation layers to close the feedback loop.

**Future (v2):** Analytics becomes its own agent loop — analyzes *why* certain content performed well and adjusts ideation strategy automatically.

---

## Current Implementation Status

### Built (MVP packages)

| Package            | Status | Notes                                    |
|--------------------|--------|------------------------------------------|
| `@vectis/shared`   | ✅     | Types, DB client, config, logger, retry — includes Research, YouTube, PipelineStageLog types |
| `@vectis/research` | ✅     | Tavily search + extract, `buildResearchBrief()` runs 5 parallel searches |
| `@vectis/ideation` | ✅     | Claude `tool_use` agent loop (tavily_search, tavily_extract, score_lookup, submit_content) + legacy prompt-based flow |
| `@vectis/voice`    | ✅     | ElevenLabs TTS + R2 storage             |
| `@vectis/video`    | ✅     | Remotion render (2 compositions)         |
| `@vectis/publisher`| ✅     | TikTok upload + YouTube Shorts (resumable upload via Data API v3, OAuth 2.0) |
| `@vectis/analytics`| ✅     | Metrics ingest + topic scoring           |
| `apps/api`         | ✅     | Hono REST API — 8 original routes + `/youtube` (4 endpoints) + `/pipeline` (8 endpoints) |
| `infra/n8n`        | ✅     | Docker Compose (Traefik + n8n + PG) + 3 workflow JSONs (main-pipeline, analytics-feedback, content-calendar) |
| `supabase`         | ✅     | 2 migrations — 11 tables total (`research_briefs`, `youtube_credentials`, `pipeline_stage_logs` added) |

### Needs to Be Built

| Package / Feature                | Priority | Notes                                      |
|----------------------------------|----------|--------------------------------------------|
| Assembly layer                   | **P2**   | Auto-captions, multi-format, A/B variants  |
| AI video gen integration         | **P2**   | Kling / Veo / Runway                      |
| Image gen integration            | **P2**   | FLUX / Midjourney                          |
| TikTok app review                | **P2**   | Needs domain, legal pages, demo video      |
| Instagram Reels publisher        | **P3**   | Post-MVP                                   |
| Revenue tracking dashboard       | **P3**   | Post-MVP                                   |
| Analytics agent loop (v2)        | **P3**   | Agent analyzes performance patterns        |

### Niches (MVP)

- **Tech Explainers** — dark theme composition
- **Finance Education** — dark blue/green theme composition, includes disclaimers

### Key Constraints

- Faceless content with preset ElevenLabs voices
- Vertical video (1080×1920) for short-form platforms
- MVP targets YouTube Shorts first (instant API access, real ad revenue)
- Orchestrated by self-hosted n8n (needs cloud VPS, not Raspberry Pi)
- Data stored in Supabase (DB, auth, storage, real-time)
- Research uses Tavily for web search (structured queries + agent tool access)
- Ideation is the only agentic stage in MVP — all others are deterministic
