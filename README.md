# Vectis

Automated AI content pipeline that researches trending topics, writes scripts, generates voice and video, and publishes short-form content to social platforms.

**Pipeline:** Research → Ideation → Voice → Video → Assembly → Publish → Analyze → Repeat

## Architecture

```
vectis/
├── apps/
│   └── api/              # Hono REST API — orchestrates the pipeline
├── packages/
│   ├── shared/           # Types, config, DB client, logger, retry, R2 utils
│   ├── research/         # Tavily search + Firecrawl scraping → research briefs
│   ├── ideation/         # Claude agent with tools → topics + scripts
│   ├── voice/            # ElevenLabs TTS → voice assets on R2
│   ├── video/            # Remotion compositions → 9:16 short-form video
│   ├── assembly/         # Whisper transcription → captions → multi-format
│   ├── publisher/        # YouTube Shorts + TikTok publishing
│   └── analytics/        # Metrics ingestion + topic scoring feedback loop
├── scripts/
│   ├── e2e-pipeline.ts   # End-to-end pipeline test (full + dry-run)
│   └── purge-r2.ts       # R2 bucket cleanup utility
├── infra/
│   └── n8n/              # Workflow automation (Docker Compose + 3 workflows)
└── supabase/             # PostgreSQL schema (4 migrations, ~15 tables)
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| API | [Hono](https://hono.dev) |
| Monorepo | pnpm + [Turborepo](https://turbo.build) |
| Language | TypeScript (ESM) |
| Database | [Supabase](https://supabase.com) (PostgreSQL) |
| LLM | Anthropic Claude Opus 4.6 (agentic ideation with tool use) |
| Web Search | [Tavily](https://tavily.com) |
| Web Scraping | [Firecrawl](https://firecrawl.dev) |
| Voice | [ElevenLabs](https://elevenlabs.io) (eleven_flash_v2_5) |
| Video | [Remotion](https://remotion.dev) (React-based compositions) |
| Transcription | OpenAI Whisper (word-level timestamps) |
| Storage | Cloudflare R2 (S3-compatible) |
| Orchestration | [n8n](https://n8n.io) (self-hosted) |
| Testing | Vitest |

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 10+
- FFmpeg (for assembly/format conversion)
- Docker (for n8n, optional)

### Install

```bash
git clone https://github.com/tywenrick3/vectis.git
cd vectis
pnpm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
# API
API_PORT=3001
API_KEY=vectis_sk_your_secret_key

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# AI / Search / Scraping
ANTHROPIC_API_KEY=sk-ant-...
TAVILY_API_KEY=tvly-...
FIRECRAWL_API_KEY=fc-...
OPENAI_API_KEY=sk-...

# Voice
ELEVENLABS_API_KEY=your_key
ELEVENLABS_VOICE_ID=your_voice_id

# Storage (Cloudflare R2)
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=vectis
R2_PUBLIC_URL=https://your-bucket.r2.dev

# YouTube
YOUTUBE_CLIENT_ID=your_client_id
YOUTUBE_CLIENT_SECRET=your_client_secret
YOUTUBE_REDIRECT_URI=http://localhost:3001/youtube/callback

# TikTok (optional)
TIKTOK_CLIENT_KEY=your_key
TIKTOK_CLIENT_SECRET=your_secret
TIKTOK_REDIRECT_URI=http://localhost:3001/oauth/tiktok/callback
```

### Database Setup

Apply Supabase migrations:

```bash
supabase db push
```

This creates ~15 tables including: `topics`, `scripts`, `voice_assets`, `videos`, `pipeline_runs`, `pipeline_stage_logs`, `research_briefs`, `transcriptions`, `assembly_jobs`, `assembly_outputs`, `analytics_snapshots`, `tiktok_credentials`, and `youtube_credentials`.

### Build & Run

```bash
pnpm build       # Build all packages
pnpm dev         # Start the API server (default port 3001)
```

### YouTube OAuth

1. Visit `http://localhost:3001/youtube/auth` to start the OAuth flow
2. Authorize your Google account
3. Check connection: `GET http://localhost:3001/youtube/status`

## API

All pipeline endpoints require `x-api-key: <API_KEY>` header.

### Pipeline Endpoints

```
POST /pipeline/research          # Research trending topics for a niche
POST /pipeline/ideate            # Generate topic + script from research brief
POST /pipeline/generate-voice    # Synthesize voice from script
POST /pipeline/render-video      # Render Remotion composition
POST /pipeline/assemble          # Transcribe, caption, multi-format convert
POST /pipeline/publish           # Publish to YouTube Shorts or TikTok
POST /pipeline/analytics         # Ingest metrics and update topic scores
POST /pipeline/record-run        # Record completed pipeline run
GET  /pipeline/status/:runId     # Check pipeline run status
DELETE /pipeline/:runId/files    # Delete R2 assets for a single published run
DELETE /pipeline/published/files # Bulk delete R2 assets for all published runs
```

### Running the Full Pipeline

Each stage feeds into the next:

```bash
# 1. Research
curl -X POST http://localhost:3001/pipeline/research \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"niche": "tech-explainer"}'

# 2. Ideate (uses research_brief_id from step 1)
curl -X POST http://localhost:3001/pipeline/ideate \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"research_brief_id": "<id>"}'

# 3. Generate voice (uses script_id from step 2)
curl -X POST http://localhost:3001/pipeline/generate-voice \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"script_id": "<id>"}'

# 4. Render video
curl -X POST http://localhost:3001/pipeline/render-video \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"script_id": "<id>", "voice_asset_id": "<id>"}'

# 5. Assemble (transcribe + captions + formats)
curl -X POST http://localhost:3001/pipeline/assemble \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"script_id": "<id>", "video_id": "<id>", "voice_asset_id": "<id>"}'

# 6. Publish
curl -X POST http://localhost:3001/pipeline/publish \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"video_id": "<id>", "script_id": "<id>", "platform": "youtube"}'
```

### E2E Pipeline Script

Run the entire pipeline automatically with the e2e script:

```bash
pnpm e2e                                    # full run (includes publish)
pnpm e2e:dry                                # dry run (stops after assemble)
pnpm e2e -- --niche finance-education       # different niche
```

The script manages its own server lifecycle, validates YouTube connectivity, tracks timing per stage, and provides a detailed summary report.

## Pipeline Stages

### Research

Runs 7 parallel Tavily searches per niche (trending, news, competitor, saturation, sources, insider, events), batch scrapes top URLs via Firecrawl, and compiles a structured `ResearchBrief` enriched with performance context from past topics.

### Ideation

An agentic Claude loop that takes a research brief and produces a topic + script. The agent has access to 6 tools: follow-up web search, URL extraction, Firecrawl scraping, past topic score lookups, title uniqueness checking, and final content submission. Runs up to 20 iterations. Mandatory performance lookup ensures data-driven topic selection.

### Voice

Sends the script text to ElevenLabs `eleven_flash_v2_5`, uploads the resulting MP3 to R2, and stores metadata (duration, cost) in the database.

### Video

Renders a Remotion composition at 1080x1920 (9:16) / 30fps with programmatic data visualizations. Each script segment's `visual_cue` is a structured object that maps to a specific component:

- **AnimatedCounter** — Numbers tick up with spring bounce (e.g. "$202B")
- **BarChart** — Horizontal bars grow with staggered timing
- **ComparisonCard** — Two cards slide in from opposite edges
- **StatCallout** — Big stat with direction arrow and radial glow
- **ListReveal** — Bullet points appear one by one
- **PieChart** — Animated pie chart with segment labels
- **Timeline** — Sequential event timeline visualization
- **TextSlide** — Fallback for simple text

All compositions include an animated gradient background, progress bar, and smooth enter/exit transitions per segment. Niche-specific theming (tech = cyan, finance = green) is applied via a shared `NicheComposition`. Output is uploaded to R2.

### Assembly

1. Transcribes the voice asset with OpenAI Whisper (word-level timestamps)
2. Re-renders the video with burned-in captions
3. Optionally converts to additional formats (16:9 letterbox, 1:1 center-crop)
4. Supports hook variant A/B testing

### Publish

Uploads the final video to YouTube Shorts (via Data API v3 resumable upload) or TikTok (via Content Posting API pull-from-URL). Handles OAuth token refresh automatically.

### Analytics

Ingests platform metrics from YouTube (views, likes, comments) and TikTok (views, likes, comments, shares, watch time). Computes composite topic scores with weighted engagement metrics (views 30%, likes 20%, comments 25%, shares 25%) and feeds them back into ideation via performance context.

## n8n Workflows

Three workflow files in `infra/n8n/workflows/`:

- **main-pipeline.json** — End-to-end pipeline trigger
- **analytics-feedback.json** — Metrics ingestion → topic scoring loop
- **content-calendar.json** — Multi-niche scheduling

Start n8n with Docker:

```bash
cd infra/n8n
docker compose up -d
```

n8n runs on port 5678.

## Testing

```bash
pnpm test        # Run all tests across packages
pnpm typecheck   # TypeScript validation
pnpm build       # Full build (tsc all packages)
```

## Scripts

```bash
pnpm e2e         # Full end-to-end pipeline test
pnpm e2e:dry     # Dry run (stops before publish)
pnpm purge-r2    # Empty R2 bucket (interactive confirmation)
```

## Cost Estimate

Running ~1 video/day across a few niches:

| Service | Free Tier | Est. Monthly Cost |
|---------|-----------|-------------------|
| Anthropic (Claude) | No | ~$5-20 |
| Tavily | 1K searches | $0 |
| Firecrawl | 500 pages | $0 |
| ElevenLabs | 10K chars | $5-22 |
| OpenAI (Whisper) | No | ~$1-5 |
| Cloudflare R2 | 10GB storage | $0 |
| YouTube API | Yes | $0 |
| Supabase | 500MB DB | $0 |
| **Total** | | **~$11-47/month** |

## License

Private.
