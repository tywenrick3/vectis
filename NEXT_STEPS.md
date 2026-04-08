# Vectis — Next Steps

> Updated 2026-04-08 after full project audit. Phases 1, 2, and 2.5 are complete. Pipeline is operational with 2 published YouTube Shorts.

---

## Immediate (this week)

### 1. Fix 3 failing tests
- `packages/voice` — update `elevenlabs.test.ts` to match current voice settings (stability 0.35, style 0.45, speed 1.1)
- `packages/assembly` — fix `format.test.ts` crop calculation assertion for 1:1 center-crop
- `packages/assembly` — fix `transcribe.test.ts` fetch spy setup in dedup test path

### 2. Commit uncommitted e2e timeout change
- `scripts/e2e-pipeline.ts` has a 2-line diff: analytics + research timeouts bumped 120s → 180s
- Commit it so git status is clean

### 3. Run more videos and evaluate quality
- Run the pipeline 3-5 more times across both niches
- Watch every video critically: hook strength, visual engagement, pacing, caption readability, audio quality
- Note specific issues to fix (animation timing, font choices, cue types that don't land)
- Build analytics dataset for the feedback loop

---

## Short-term (next 1-2 weeks)

### 4. Hook variant generation
- Only missing piece: get ideation agent to populate `scripts.hook_variants`
- Schema, assembly rendering, and A/B infra are all built
- Highest-leverage change: same content, multiple hooks to test scroll-stopping

### 5. Accumulate analytics data
- More published videos = better `score_lookup` context for ideation agent
- Run `POST /pipeline/analytics` periodically to ingest YouTube metrics
- Watch scoring trends to validate the feedback loop

### 6. Multi-niche expansion
- Adding a niche = prompt file + theme entry + composition wrapper
- Candidates: health/science, AI/ML news, productivity tips
- Broadens output without architectural changes

---

## Medium-term (next 2-4 weeks)

### 7. Production deployment
- Provision VPS, deploy n8n + Hono API
- Wire up n8n workflows (main-pipeline, analytics-feedback, content-calendar)
- Set up daily cron triggers
- Move YouTube OAuth to production mode (start Google review early — can take weeks)
- Domain + DNS + HTTPS + updated OAuth redirect URIs

### 8. Visual polish iteration
- Tune animation timing (spring constants, delays, easing) based on video review
- Caption styling (font weight, shadow, background, position)
- Test pie_chart and timeline cue types against real scripts
- Per-niche color refinement

---

## Future

### 9. TikTok publishing
- Code is built, needs app review + production domain for OAuth redirect
- Submit for TikTok developer review once production is deployed

### 10. Analytics agent (v2)
- Agent loop that analyzes *why* certain content performed well
- Automatically adjusts ideation strategy based on patterns
- Requires substantial analytics dataset first
