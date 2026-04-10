# Vectis Roadmap

## Context

Vectis is an automated AI content pipeline (research → ideation → voice → video → assembly → publish → analytics). 8 packages + 1 Hono API app in a Turborepo monorepo. Supabase DB (4 migrations, ~15 tables), Cloudflare R2 storage, n8n orchestration.

---

## Phase 1: MVP Pipeline — DONE

### P1: Unblock Local Startup (Code Changes) — DONE

- [x] Make TikTok env vars optional in `packages/shared/src/config.ts`
- [x] Add guard checks in TikTok auth/publisher code for clear errors
- [x] Update tests to reflect optional TikTok vars

### P2: External Service Setup — DONE

- [x] **Supabase** — Project live, all migrations applied, ~15 tables verified
- [x] **Anthropic** — API key configured, Claude Opus 4.6 across all ideation call sites
- [x] **Tavily** — Account created, API key configured
- [x] **ElevenLabs** — Account created, voice selected, API key + voice ID configured
- [x] **Cloudflare R2** — Bucket created, API token configured, public access via R2.dev
- [x] **OpenAI** — API key configured (for Whisper transcription)
- [x] **YouTube / Google Cloud** — OAuth flow working, channel connected (testing mode)
- [x] **Firecrawl** — API key configured, integrated into research + ideation agent
- [x] **All env vars set** in `.env`

### P3: Local End-to-End Test — DONE

- [x] API server starts on port 3001
- [x] YouTube OAuth flow completed, channel `UCxTS8-miIkQ6vOwXmQqioqA`
- [x] All 7 pipeline stages tested individually
- [x] First video published: `https://youtube.com/shorts/rlPIVbWBK0Q`

#### Bugs fixed
- Remotion `.js` imports → extensionless (webpack can't resolve `.tsx`)
- Assembly FK violation: placeholder `transcription_id` → transcribe before job insert
- R2 public access: enabled R2.dev subdomain, updated stored URLs
- ElevenLabs: upgraded to Starter plan (free tier blocks library voices via API)

---

## Phase 2: Video Composition Overhaul — DONE

Replaced text-on-black-background compositions with programmatic data visualizations and motion graphics. No AI-generated images — all pure React/Remotion components.

### Structured Visual Cue Type System — DONE
- [x] Added `VisualCue` discriminated union to `packages/shared/src/types.ts`
- [x] 8 cue types: `animated_counter`, `bar_chart`, `comparison`, `stat_callout`, `list_reveal`, `text_slide`, `pie_chart`, `timeline`
- [x] `ScriptSegment.visual_cue` accepts `string | VisualCue` (backward compatible)
- [x] `isStructuredCue()` type guard

### Visual Components — DONE
- [x] `AnimatedGradient` — Moving gradient background (replaces flat black)
- [x] `ProgressBar` — Thin bar at top showing video progress
- [x] `SegmentTransition` — Enter/exit animation wrapper
- [x] `AnimatedCounter` — Number ticks up with spring bounce (e.g. "$202B")
- [x] `BarChart` — Horizontal bars grow with staggered timing
- [x] `ComparisonCard` — Two cards slide in from opposite edges
- [x] `StatCallout` — Big stat with spring scale + direction arrow + radial glow
- [x] `ListReveal` — Bullet points appear one by one from right
- [x] `TextSlide` — Fallback for old string visual_cue values
- [x] `PieChart` — Animated pie chart with segment labels
- [x] `Timeline` — Sequential event timeline visualization
- [x] `SegmentRenderer` — Dispatcher: cue type → correct component
- [x] `NicheComposition` — Shared composition used by all niches
- [x] Centralized theme system (`themes.ts`) with per-niche colors

### Composition Refactoring — DONE
- [x] `TechExplainer` → thin wrapper (cyan theme)
- [x] `FinanceEducation` → thin wrapper (green theme + disclaimer)
- [x] Barrel export (`visuals/index.ts`)

### Script Writer Updates — DONE
- [x] Updated prompts for both niches with full visual_cue type documentation + examples
- [x] Updated JSON template in `script-writer.ts` to request structured objects
- [x] Added post-parse normalization (invalid objects → `text_slide` fallback)
- [x] Updated `submit_content` tool schema in `agent.ts`

### Second End-to-End Test — DONE
- [x] Fixed remaining `.js` imports in `packages/shared/src` and `packages/video/src`
- [x] Fixed test file exclusions across all 9 `tsconfig.json` files
- [x] Full pipeline test with new visuals: "Your Skull Is Your Next Password"
- [x] Script generated structured cues: comparison, list_reveal, bar_chart, stat_callout
- [x] Published to YouTube: `https://youtube.com/shorts/hvKIjIMk3C4`

---

## Phase 2.5: Research & Tooling Hardening — DONE

### Firecrawl Integration — DONE
- [x] Added Firecrawl web scraping to research package (batch scrape top URLs)
- [x] Added `firecrawl_scrape` tool to ideation agent
- [x] Added `check_uniqueness` tool to ideation agent (30-day dedup window)
- [x] Research brief now enriched with scraped article content
- [x] Performance context (top/low performers) passed to ideation agent

### Analytics Package — DONE
- [x] YouTube metrics ingestion (`youtube-ingest.ts`)
- [x] TikTok metrics ingestion (`ingest.ts`)
- [x] Composite topic scoring with weighted engagement (views 30%, likes 20%, comments 25%, shares 25%)
- [x] Performance context API for ideation (`getPerformanceContext`)

### E2E Pipeline Script — DONE
- [x] Full pipeline test script (`scripts/e2e-pipeline.ts`)
- [x] Server lifecycle management (start/stop/health check)
- [x] Dry-run mode (skip publish + record-run)
- [x] Per-stage timing and detailed failure reporting
- [x] YouTube OAuth validation before publish

### R2 Cleanup — DONE
- [x] Per-run R2 asset deletion (API endpoint)
- [x] Bulk R2 deletion for published runs (API endpoint with dry-run support)
- [x] `purge-r2` script for full bucket wipe
- [x] Nullable media URLs in DB (migration 004) for post-deletion state

---

## Phase 3: Growth & Polish — NEXT

### 3.1 Fix failing tests — DONE
- [x] Update `packages/voice` test to match current voice settings (stability 0.35, style 0.45, speed 1.1)
- [x] Fix `packages/assembly` format test (crop calculation assertion)
- [x] Fix `packages/assembly` transcribe dedup test (broken fetch spy assertion)

### 3.2 Hook variant generation
- [ ] Update ideation agent prompt to generate 2-3 hook variants per script
- [ ] Schema supports `scripts.hook_variants` but ideation never populates it
- [ ] Assembly already supports rendering variants — needs ideation to produce them

### 3.3 Visual polish
- [ ] Tune animation timing based on real video review
- [ ] Consider per-segment accent color overrides
- [ ] Review pie_chart and timeline components against real script output
- [ ] Caption styling improvements (font, size, shadow, position)

### 3.4 Multi-niche expansion
- [ ] Add new niches beyond tech-explainer and finance-education
- [ ] Each niche needs: prompt file + theme entry + composition wrapper
- [ ] Evaluate niches: health/science, AI/ML, gaming, productivity

### 3.5 Production deployment
- [ ] Provision VPS ($4-12/month)
- [ ] Deploy n8n with Docker (workflows in `infra/n8n/workflows/`)
- [ ] Deploy Hono API (Cloudflare Workers or same VPS)
- [ ] Set up domain + DNS
- [ ] Update OAuth redirect URIs from localhost to production domain
- [ ] Enable daily automated pipeline runs via n8n cron
- [ ] YouTube OAuth: move from testing mode to production (requires Google review)

### 3.6 Content quality feedback
- [ ] Watch published videos, evaluate visual quality, pacing, hook effectiveness
- [ ] Tune ideation agent system prompt based on performance data
- [ ] Adjust voice settings based on listener feedback
- [ ] Identify weak visual cue types and improve or replace them

---

## Configuration Notes

- **API runs on port 3001** (port 3000 is used by Docker/n8n)
- **YouTube OAuth redirect URI:** `http://localhost:3001/youtube/callback`
- **TikTok env vars are optional** — not needed for YouTube-only pipeline
- **YouTube OAuth is in "testing" mode** — works immediately, no Google review needed
- **LLM model:** `claude-opus-4-6` across all ideation call sites
- **Research:** 7 parallel Tavily searches + Firecrawl batch scraping per brief
- **Ideation agent tools:** tavily_search, tavily_extract, firecrawl_scrape, score_lookup, check_uniqueness, submit_content

---

## Published Videos

| # | Title | YouTube ID | Date | Visual Cues |
|---|-------|-----------|------|-------------|
| 1 | AI Servers Are About to Eat the World | `rlPIVbWBK0Q` | 2026-03-31 | text-on-black (pre-overhaul) |
| 2 | Your Skull Is Your Next Password | `hvKIjIMk3C4` | 2026-03-31 | comparison, list_reveal, bar_chart, stat_callout |

---

## Monthly Cost Estimate

| Service | Free Tier | Estimated Cost |
|---------|-----------|---------------|
| Anthropic (Claude) | No | ~$5-20 |
| Tavily | 1K searches | $0 |
| Firecrawl | 500 pages | $0 |
| ElevenLabs | 10K chars | $5-22 |
| OpenAI (Whisper) | No | ~$1-5 |
| Cloudflare R2 | 10GB | $0 |
| YouTube API | Yes | $0 |
| Supabase | 500MB DB | $0 |
| **Total MVP** | | **~$11-47/month** |
