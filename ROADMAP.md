# Vectis: Road to First YouTube Shorts Publish

## Context

Vectis is an automated AI content pipeline (research -> ideation -> voice -> video -> assembly -> publish -> analytics). The code is architecturally complete across 8 packages with a Hono API, Supabase schema (3 migrations), and n8n workflow.

**Goal:** Get the full pipeline working and publish a video to YouTube Shorts.

---

## Priority 1: Unblock Local Startup (Code Changes) — DONE

- [x] Make TikTok env vars optional in `packages/shared/src/config.ts`
- [x] Add guard checks in TikTok auth/publisher code for clear errors
- [x] Update tests to reflect optional TikTok vars

---

## Priority 2: External Service Setup — DONE

- [x] **Supabase** — Project live, all 3 migrations applied, 13 tables verified
- [x] **Anthropic** — API key configured
- [x] **Tavily** — Account created, API key configured
- [x] **ElevenLabs** — Account created, voice selected, API key + voice ID configured
- [x] **Cloudflare R2** — Bucket created, API token configured
- [x] **OpenAI** — API key configured (for Whisper transcription)
- [x] **YouTube / Google Cloud** — Project created, YouTube Data API v3 enabled, OAuth consent screen configured (testing mode), OAuth credentials created
- [x] **All 16 env vars set** in `.env`

---

## Priority 3: Local End-to-End Test — IN PROGRESS

### 3.1 Verify startup — DONE
- [x] API server starts on port 3001 (port 3000 occupied by Docker/n8n)
- [x] `GET /health` returns `{"status":"ok"}`

### 3.2 Complete YouTube OAuth flow — DONE
- [x] OAuth flow completed via `http://localhost:3001/youtube/auth`
- [x] Tokens stored in `youtube_credentials` table
- [x] Channel ID: `UCxTS8-miIkQ6vOwXmQqioqA`
- [x] `GET /youtube/status` confirms connected + token valid

### 3.3 Test each pipeline stage individually — DONE
- [x] `POST /pipeline/research` — research_brief_id: `34f6c207-6df7-4a02-aff1-c71cd40da53c`
- [x] `POST /pipeline/ideate` — script: "AI Servers Are About to Eat the World (And Your Wallet)"
- [x] `POST /pipeline/generate-voice` — 62s audio, uploaded to R2
- [x] `POST /pipeline/render-video` — TechExplainer composition, 3.6MB MP4
- [x] `POST /pipeline/assemble` — Whisper transcription + captioned re-render, 5.5MB output
- [x] `POST /pipeline/publish` — **PUBLISHED** to YouTube Shorts, video ID: `rlPIVbWBK0Q`

### 3.4 Verify on YouTube — DONE
- [x] Video live at `https://youtube.com/shorts/rlPIVbWBK0Q`

### Bugs fixed during testing
- Remotion `.js` imports → extensionless (webpack can't resolve `.tsx`)
- Assembly FK violation: placeholder `transcription_id` → transcribe before job insert
- R2 public access: enabled R2.dev subdomain, updated stored URLs
- ElevenLabs: upgraded to Starter plan (free tier blocks library voices via API)

---

## Priority 4: Post-First-Publish Improvements

### 4.1 YouTube analytics ingest
- **Why:** `packages/analytics/src/ingest.ts` only fetches TikTok metrics. YouTube videos won't feed back into topic scoring.
- **What:** Add YouTube Data API v3 video stats fetching (views, likes, comments) alongside existing TikTok path.

### 4.2 Hook variant generation
- **Why:** Schema supports `scripts.hook_variants` but ideation never populates it. Assembly can render variants but gets nothing.
- **What:** Update ideation agent prompt to generate 2-3 hook variants per script.

### 4.3 Deploy to production
- [ ] Provision VPS ($4-12/month)
- [ ] Deploy n8n with Docker (workflow already in `infra/n8n/main-pipeline.json`)
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
