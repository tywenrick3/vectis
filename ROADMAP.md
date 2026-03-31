# Vectis Roadmap

## Context

Vectis is an automated AI content pipeline (research -> ideation -> voice -> video -> assembly -> publish -> analytics). The code is architecturally complete across 8 packages with a Hono API, Supabase schema (3 migrations), and n8n workflow.

---

## Phase 1: MVP Pipeline — DONE

### P1: Unblock Local Startup (Code Changes) — DONE

- [x] Make TikTok env vars optional in `packages/shared/src/config.ts`
- [x] Add guard checks in TikTok auth/publisher code for clear errors
- [x] Update tests to reflect optional TikTok vars

### P2: External Service Setup — DONE

- [x] **Supabase** — Project live, all 3 migrations applied, 13 tables verified
- [x] **Anthropic** — API key configured
- [x] **Tavily** — Account created, API key configured
- [x] **ElevenLabs** — Account created, voice selected, API key + voice ID configured
- [x] **Cloudflare R2** — Bucket created, API token configured, public access via R2.dev
- [x] **OpenAI** — API key configured (for Whisper transcription)
- [x] **YouTube / Google Cloud** — Project created, YouTube Data API v3 enabled, OAuth consent screen configured (testing mode), OAuth credentials created
- [x] **All 16 env vars set** in `.env`

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
- [x] 6 cue types: `animated_counter`, `bar_chart`, `comparison`, `stat_callout`, `list_reveal`, `text_slide`
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

## Phase 3: Growth & Polish — NEXT

### 3.1 YouTube analytics ingest
- [ ] Add YouTube Data API v3 video stats fetching (views, likes, comments) to `packages/analytics/src/ingest.ts`
- [ ] Currently only fetches TikTok metrics — YouTube videos don't feed back into topic scoring

### 3.2 Hook variant generation
- [ ] Update ideation agent prompt to generate 2-3 hook variants per script
- [ ] Schema supports `scripts.hook_variants` but ideation never populates it
- [ ] Assembly already supports rendering variants

### 3.3 Visual polish
- [ ] Tune animation timing based on real video review
- [ ] Add more visual cue types as needed (timeline, pie chart, quote card)
- [ ] Consider per-segment accent color overrides

### 3.4 Multi-niche expansion
- [ ] Add new niches beyond tech-explainer and finance-education
- [ ] Each niche just needs a prompt file + theme entry

### 3.5 Deploy to production
- [ ] Provision VPS ($4-12/month)
- [ ] Deploy n8n with Docker (workflow in `infra/n8n/main-pipeline.json`)
- [ ] Deploy Hono API (Cloudflare Workers or same VPS)
- [ ] Set up domain + DNS
- [ ] Update OAuth redirect URIs from localhost to production domain
- [ ] Enable daily automated pipeline runs via n8n cron

---

## Configuration Notes

- **API runs on port 3001** (port 3000 is used by Docker/n8n)
- **YouTube OAuth redirect URI:** `http://localhost:3001/youtube/callback`
- **TikTok env vars are optional** — not needed for YouTube-only pipeline
- **YouTube OAuth is in "testing" mode** — works immediately, no Google review needed
- **LLM model:** `claude-opus-4-6` across all 4 ideation call sites

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
| ElevenLabs | 10K chars | $5-22 |
| OpenAI (Whisper) | No | ~$1-5 |
| Cloudflare R2 | 10GB | $0 |
| YouTube API | Yes | $0 |
| Supabase | 500MB DB | $0 |
| **Total MVP** | | **~$11-47/month** |
