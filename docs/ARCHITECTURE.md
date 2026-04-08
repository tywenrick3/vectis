# Vectis — AI Content Pipeline Architecture

> End-to-end automated pipeline: **trigger → research → ideation (agent) → generation → assembly → publish → analyze → repeat**

## Pipeline Overview

```
┌─────────┐   ┌──────────┐   ┌───────────────────┐   ┌────────────┐   ┌──────────┐   ┌─────────┐   ┌───────────┐
│ TRIGGER  │──▸│ RESEARCH │──▸│ IDEATION (agent)  │──▸│ GENERATION │──▸│ ASSEMBLY │──▸│ PUBLISH │──▸│ ANALYTICS │
└─────────┘   └──────────┘   └───────────────────┘   └────────────┘   └──────────┘   └─────────┘   └───────────┘
     ▴              │                  │                                                                   │
     │              │    Tavily tool ◂─┘                                                                   │
     │              │    Firecrawl  ◂─┘                                                                    │
     │              │    (on-demand deep dives)                                                             │
     │              │                                                                                      │
     └──────────────┴─────────────────── FEEDBACK LOOP ◂──────────────────────────────────────────────────┘
```

## Orchestrator

**n8n** (self-hosted) manages the entire pipeline. Each layer is a node group. Cron triggers fire daily. Error handling and retries are built in. Webhook nodes receive analytics callbacks.

The **Hono API** (`apps/api`) exposes per-stage REST endpoints that n8n calls. Each stage can also be invoked independently for testing.

---

## 1. Trigger — Input Sources

| Source           | Description                          | Tool                          |
|------------------|--------------------------------------|-------------------------------|
| Cron Schedule    | Automated daily/weekly cadence       | n8n Cron Node                 |
| E2E Script       | `pnpm e2e` / `pnpm e2e:dry`         | `scripts/e2e-pipeline.ts`     |
| Manual Curl      | Per-stage API calls                  | REST endpoints                |
| Content Calendar | Planned topics from data store       | Supabase                      |

## 2. Research — Web Intelligence

The research stage runs **before** ideation to gather fresh, real-time context. It performs structured, parallelizable searches and outputs a `ResearchBrief` — a JSON document that gives the ideation agent grounded, current information.

| Component            | Description                                         | Tool           |
|----------------------|-----------------------------------------------------|----------------|
| Trending Topic Scan  | What's trending in the niche right now               | Tavily Search  |
| News & Current Events| Recent news relevant to niches                       | Tavily Search  |
| Competitor Analysis  | What top creators are posting, angles being used     | Tavily Search  |
| Saturation Check     | How crowded is a topic — avoid duplication           | Tavily Search  |
| Source Material      | Articles, data points, quotes to reference           | Tavily Search  |
| Insider Intelligence | Expert takes, industry analysis                      | Tavily Search  |
| Events & Launches    | Upcoming events, product launches                    | Tavily Search  |
| Deep Scraping        | Full article content from top URLs                   | Firecrawl      |
| Performance Context  | Recently covered topics, top/low performers          | Analytics DB   |

**7 parallel Tavily searches** + **Firecrawl batch scrape** of top 8 URLs + **performance context** from analytics.

**Output: `ResearchBrief`**
```typescript
{
  niche: string;
  trending_topics: TrendingTopic[];
  recent_news: NewsItem[];
  competitor_angles: string[];
  saturation_signals: string[];
  source_material: SourceItem[];
  searched_at: string;
}
```

**Why a separate stage (not just agent tools):**
- Structured searches are cheap, fast, and parallelizable (run all 7 search types at once)
- Predictable cost — fixed number of Tavily calls per run
- Research brief is cached in Supabase for debugging and reuse
- The agent loop in Ideation can still call Tavily/Firecrawl for targeted follow-ups

## 3. Ideation — Agent Loop

Ideation is an **agentic loop** — Claude Opus 4.6 with tool access, not a single prompt-in/script-out call. It receives the research brief as context and can reason iteratively about what to create.

```
┌──────────────────────────────────────────────────────────┐
│  IDEATION AGENT (Claude Opus 4.6, up to 20 iterations)   │
│                                                          │
│  Context: ResearchBrief + niche prompts + perf history   │
│                                                          │
│  Tools available:                                        │
│  ├─ tavily_search     (targeted follow-up searches)      │
│  ├─ tavily_extract    (pull specific page content)       │
│  ├─ firecrawl_scrape  (clean markdown from URLs)         │
│  ├─ score_lookup      (check past topic performance)     │
│  ├─ check_uniqueness  (30-day title dedup)               │
│  └─ submit_content    (final topic + script submission)  │
│                                                          │
│  Agent loop:                                             │
│  1. Review research brief                                │
│  2. MANDATORY: lookup past performance scores            │
│  3. Identify best angle (gap in saturation)              │
│  4. Optional: search deeper on chosen angle              │
│  5. Check uniqueness against recent 30 days              │
│  6. Generate topic + script (hook → body → CTA)          │
│  7. Self-critique: is the hook strong enough?            │
│  8. Submit final Topic + Script                          │
└──────────────────────────────────────────────────────────┘
```

**Key agent rules:**
- Must call `score_lookup` before choosing an angle (mandatory, not optional)
- Hook must contain concrete fact, specific number, or named entity
- Rejects: broad trends, vague futures, generic listicles, already-covered topics
- Performance-informed: 70+ score = winning pattern, <30 = underperformer to avoid

**Why an agent loop here (and nowhere else in MVP):**
- Ideation is the one stage where **judgment and adaptation** matter most
- A fixed prompt can't decide "this angle is oversaturated, pivot to X"
- The agent can self-critique and iterate on hook quality before committing
- Cost is bounded: research brief handles the broad sweep, agent only does targeted follow-ups
- All other stages (generation, assembly, publish) are deterministic

## 4. Generation — Asset Creation

| Component       | Description                          | Tool                          |
|-----------------|--------------------------------------|-------------------------------|
| Voice Synthesis | ElevenLabs `eleven_flash_v2_5`       | ElevenLabs API → R2           |
| Visual Render   | Programmatic video from script       | Remotion (React + TS) → R2    |

**Visual cue types:** `animated_counter`, `bar_chart`, `comparison`, `stat_callout`, `list_reveal`, `text_slide`, `pie_chart`, `timeline`

Each script segment maps to a React component via `SegmentRenderer`. Compositions include animated gradient backgrounds, progress bar, and per-segment enter/exit transitions. Niche-specific theming via `themes.ts`.

## 5. Assembly — Post-Processing

| Component       | Description                          | Tool                          |
|-----------------|--------------------------------------|-------------------------------|
| Transcription   | Word-level timestamps from audio     | OpenAI Whisper API            |
| Caption Burn-in | Re-render video with synced captions | Remotion `CaptionOverlay`     |
| Multi-Format    | 9:16, 16:9 (letterbox), 1:1 (crop)  | FFmpeg                        |
| Hook Variants   | A/B test different hooks             | Re-render per hook variant    |

Transcription is deduped by `voice_asset_id` — same audio won't be re-transcribed.

## 6. Publish — Distribution

| Platform         | Status    | Method                              |
|------------------|-----------|-------------------------------------|
| YouTube Shorts   | **Live**  | Data API v3 resumable upload        |
| TikTok           | Ready     | Content Posting API v2 (pull URL)   |
| Instagram Reels  | Future    | Instagram Graph API                 |

YouTube is the MVP target — instant API access, real ad revenue. TikTok code is built but requires app review.

## 7. Analytics — Feedback Loop

| Component           | Description                           | Tool                     |
|---------------------|---------------------------------------|--------------------------|
| YouTube Ingest      | Views, likes, comments                | YouTube Data API v3      |
| TikTok Ingest       | Views, likes, comments, shares, watch | TikTok Query API         |
| Topic Scoring       | Composite weighted engagement score   | Internal scoring engine   |
| Performance Context | Top/low performers fed to ideation    | Supabase query → agent   |

**Scoring weights:** views 30%, likes 20%, comments 25%, shares 25%. 30-day rolling window. Scores feed back into the ideation agent via `score_lookup` and `getPerformanceContext()`.

---

## Implementation Status

### All Packages — BUILT

| Package            | Status | Key Capabilities |
|--------------------|--------|------------------|
| `@vectis/shared`   | Done   | Types (8 visual cue types), Zod config, Supabase client, pino logger, retry, R2 utils |
| `@vectis/research` | Done   | 7 parallel Tavily searches, Firecrawl batch scraping, performance context enrichment |
| `@vectis/ideation` | Done   | Claude Opus 4.6 agent loop (6 tools, 20 max iterations), niche prompts, visual cue normalization |
| `@vectis/voice`    | Done   | ElevenLabs TTS, R2 upload, cost estimation |
| `@vectis/video`    | Done   | Remotion render, 8 visual components, 2 niche compositions, theme system |
| `@vectis/assembly` | Done   | Whisper transcription, caption burn-in, multi-format (9:16, 16:9, 1:1), hook variants |
| `@vectis/publisher`| Done   | YouTube resumable upload, TikTok pull-from-URL, OAuth token refresh |
| `@vectis/analytics`| Done   | YouTube + TikTok ingest, composite scoring, performance context API |
| `apps/api`         | Done   | Hono REST API, 8 route groups, stage logging, R2 cleanup endpoints |

### Database — 4 Migrations

| Migration | Tables Added |
|-----------|-------------|
| 001 | topics, scripts, voice_assets, videos, pipeline_runs, tiktok_credentials, analytics_snapshots |
| 002 | research_briefs, youtube_credentials, pipeline_stage_logs |
| 003 | assembly_jobs, transcriptions, assembly_outputs |
| 004 | Nullable media URLs (for R2 cleanup) |

### Infrastructure

| Component | Status |
|-----------|--------|
| n8n Docker Compose | Ready (not deployed to production) |
| 3 n8n workflows | Defined (main-pipeline, analytics-feedback, content-calendar) |
| E2E test script | Working (full + dry-run) |
| R2 cleanup tools | Working (per-run, bulk, full purge) |

### Not Yet Built

| Feature                          | Priority | Notes                                      |
|----------------------------------|----------|--------------------------------------------|
| Hook variant population          | **P3**   | Schema + assembly ready, ideation needs to produce variants |
| AI video gen integration         | **P3**   | Kling / Veo / Runway — post-MVP            |
| Instagram Reels publisher        | **P3**   | Post-MVP                                   |
| Production deployment            | **P3**   | VPS, domain, n8n cron, OAuth redirect URIs |
| Analytics agent loop (v2)        | **P4**   | Agent analyzes performance patterns        |

### Niches (Active)

- **Tech Explainer** — cyan theme, data-heavy visuals
- **Finance Education** — green theme, includes "not financial advice" disclaimer

### Key Constraints

- Faceless content with preset ElevenLabs voices
- Vertical video (1080x1920) for short-form platforms
- YouTube Shorts as primary platform (instant API access, ad revenue)
- Programmatic React/Remotion visuals only — no AI-generated images
- Orchestrated by self-hosted n8n (needs cloud VPS)
- Supabase for all data storage, R2 for media files
- Ideation is the only agentic stage — all others are deterministic
