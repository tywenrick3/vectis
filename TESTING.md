# Vectis Pipeline — Manual End-to-End Testing Guide

## Prerequisites

1. **Server running**: `pnpm dev` from project root (runs on port 3001)
2. **All env vars set** in `.env` (see checklist below)
3. **YouTube OAuth completed**: Visit `http://localhost:3001/youtube/auth` in browser first
4. **Supabase migrations applied**: All 3 migrations (13 tables)
5. **ElevenLabs**: Starter plan or higher (free tier blocks API voice synthesis)
6. **R2**: Public access enabled via R2.dev subdomain

### Env Var Checklist

```
API_PORT=3001
API_KEY=<your-key>
SUPABASE_URL=<url>
SUPABASE_SERVICE_ROLE_KEY=<key>
ANTHROPIC_API_KEY=<key>
OPENAI_API_KEY=<key>
ELEVENLABS_API_KEY=<key>
ELEVENLABS_VOICE_ID=<voice-id>
R2_ACCOUNT_ID=<id>
R2_ACCESS_KEY_ID=<key>
R2_SECRET_ACCESS_KEY=<secret>
R2_BUCKET_NAME=vectis
R2_PUBLIC_URL=https://<your-subdomain>.r2.dev
YOUTUBE_CLIENT_ID=<id>
YOUTUBE_CLIENT_SECRET=<secret>
YOUTUBE_REDIRECT_URI=http://localhost:3001/youtube/callback
TAVILY_API_KEY=<key>
```

---

## Quick Reference

All requests need the header: `x-api-key: <your API_KEY>`

```bash
# Set these once in your terminal session
export API=http://localhost:3001
export KEY=<your-api-key>
```

---

## Step 1: Health Check

Verify the server is running.

```bash
curl $API/health
```

**Expected:** `{"status":"ok","timestamp":"..."}`

---

## Step 2: YouTube OAuth Status

Confirm YouTube is connected before we get to publishing.

```bash
curl -H "x-api-key: $KEY" $API/youtube/status
```

**Expected:** `{"connected":true,"channel_id":"...","token_valid":true,...}`

If `connected: false`, visit `http://localhost:3001/youtube/auth` in your browser to re-authenticate.

---

## Step 3: Research

Generate a research brief for a niche. This calls Tavily to find trending topics, news, and competitor angles.

```bash
curl -X POST $API/pipeline/research \
  -H "x-api-key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"niche": "tech-explainer"}'
```

**Expected response:**
```json
{
  "research_brief_id": "<uuid>",
  "niche": "tech-explainer"
}
```

**Save the ID:**
```bash
export BRIEF_ID=<research_brief_id from response>
```

**What happened:**
- Tavily searched for trending tech topics, recent news, competitor content
- Stored a `research_briefs` row with trending_topics, recent_news, competitor_angles, saturation_signals

---

## Step 4: Ideation

Feed the research brief to the ideation agent. It picks the best angle, writes a script with structured visual cues, and self-critiques before submitting.

```bash
curl -X POST $API/pipeline/ideate \
  -H "x-api-key: $KEY" \
  -H "Content-Type: application/json" \
  -d "{\"research_brief_id\": \"$BRIEF_ID\"}"
```

**Expected response:**
```json
{
  "topic_id": "<uuid>",
  "script_id": "<uuid>",
  "title": "Why AI Servers Cost 40x More Than Regular Ones"
}
```

**Save the IDs:**
```bash
export TOPIC_ID=<topic_id>
export SCRIPT_ID=<script_id>
```

**What happened:**
- Claude wrote a topic + full script (hook, body segments with visual cues, CTA, caption, hashtags)
- Body segments now contain structured `visual_cue` objects (animated_counter, bar_chart, comparison, stat_callout, list_reveal, or text_slide)
- Stored rows in `topics` and `scripts` tables

**Verify the script has structured visual cues:**
Check Supabase dashboard > `scripts` table > find your script_id > inspect the `body` JSON column. Each segment's `visual_cue` should be an object with a `type` field, not a plain string.

---

## Step 5: Voice Synthesis

Generate the voiceover audio from the script via ElevenLabs.

```bash
curl -X POST $API/pipeline/generate-voice \
  -H "x-api-key: $KEY" \
  -H "Content-Type: application/json" \
  -d "{\"script_id\": \"$SCRIPT_ID\"}"
```

**Expected response:**
```json
{
  "voice_asset_id": "<uuid>",
  "audio_url": "https://<r2-subdomain>.r2.dev/audio/<script_id>.mp3",
  "duration_ms": 42000
}
```

**Save the ID:**
```bash
export VOICE_ID=<voice_asset_id>
```

**Verify:** Open the `audio_url` in your browser — you should hear the narration.

**What happened:**
- Full script text concatenated (hook + body narrations + CTA)
- Sent to ElevenLabs `eleven_flash_v2_5` model
- MP3 uploaded to R2 at `audio/{script_id}.mp3`
- Stored `voice_assets` row with duration and cost

---

## Step 6: Video Rendering

Render the video using Remotion with the new data visualization components.

```bash
curl -X POST $API/pipeline/render-video \
  -H "x-api-key: $KEY" \
  -H "Content-Type: application/json" \
  -d "{\"script_id\": \"$SCRIPT_ID\", \"voice_asset_id\": \"$VOICE_ID\"}"
```

**This takes 1-3 minutes.** Remotion bundles the React app, renders every frame, and encodes to H264.

**Expected response:**
```json
{
  "video_id": "<uuid>",
  "video_url": "https://<r2-subdomain>.r2.dev/videos/<script_id>.mp4",
  "duration_ms": 42000
}
```

**Save the ID:**
```bash
export VIDEO_ID=<video_id>
```

**Verify:** Download or open the `video_url`. You should see:
- Animated gradient background (not flat black)
- Thin progress bar at top
- Hook text with spring animation
- Data visualizations per segment (counters ticking up, bar charts growing, comparison cards sliding in, etc.)
- Smooth enter/exit transitions between segments
- CTA at the end with accent color

If you still see plain white text on black, the script's `visual_cue` fields are still strings — check Step 4 verification.

**What happened:**
- Remotion bundled the composition (TechExplainer or FinanceEducation based on niche)
- NicheComposition rendered with AnimatedGradient bg, ProgressBar, SegmentTransition wrappers, and SegmentRenderer dispatching to the correct visual component per segment
- Video encoded as 1080x1920 H264 MP4 at 30fps
- Uploaded to R2 at `videos/{script_id}.mp4`

---

## Step 7: Assembly (Captions + Formats)

Add word-level captions and optionally convert to other aspect ratios.

```bash
curl -X POST $API/pipeline/assemble \
  -H "x-api-key: $KEY" \
  -H "Content-Type: application/json" \
  -d "{\"script_id\": \"$SCRIPT_ID\", \"video_id\": \"$VIDEO_ID\", \"voice_asset_id\": \"$VOICE_ID\"}"
```

**This takes 2-4 minutes** (transcription + re-render with captions + format conversion).

**Expected response:**
```json
{
  "assembly_job_ids": ["<uuid>"],
  "primary_output_url": "https://<r2-subdomain>.r2.dev/assembled/<job_id>/9x16.mp4",
  "jobs": [
    {
      "id": "<uuid>",
      "hook_variant_index": 0,
      "status": "completed",
      "outputs": [
        {
          "format": "9:16",
          "output_url": "https://...",
          "width": 1080,
          "height": 1920
        }
      ]
    }
  ]
}
```

**Save for publishing:**
```bash
export ASSEMBLED_URL=<primary_output_url>
```

**Verify:** Open the assembled video URL. It should be the same video but now with word-by-word animated captions near the bottom of the screen.

**What happened:**
- Audio sent to OpenAI Whisper for word-level timestamps
- Video re-rendered with CaptionOverlay component synced to timestamps
- ffmpeg converted to requested formats (default: 9:16 only)
- All outputs uploaded to R2 at `assembled/{jobId}/{format}.mp4`

---

## Step 8: Publish to YouTube

Publish the assembled video as a YouTube Short.

```bash
curl -X POST $API/pipeline/publish \
  -H "x-api-key: $KEY" \
  -H "Content-Type: application/json" \
  -d "{\"video_id\": \"$VIDEO_ID\", \"script_id\": \"$SCRIPT_ID\", \"platform\": \"youtube\"}"
```

**Expected response:**
```json
{
  "publish_id": "<youtube-video-id>",
  "platform": "youtube"
}
```

**Verify:** Go to `https://youtube.com/shorts/<publish_id>` — your Short should be live (or processing).

**What happened:**
- Downloaded video from R2
- Uploaded to YouTube via Data API v3 resumable upload
- Title from script caption, description from hook + CTA + hashtags
- Privacy: public, Category: Science & Technology

---

## Step 9: Record the Run (Optional)

Track this pipeline execution for analytics.

```bash
curl -X POST $API/pipeline/record-run \
  -H "x-api-key: $KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"niche\": \"tech-explainer\",
    \"topic_id\": \"$TOPIC_ID\",
    \"script_id\": \"$SCRIPT_ID\",
    \"voice_asset_id\": \"$VOICE_ID\",
    \"video_id\": \"$VIDEO_ID\",
    \"youtube_publish_id\": \"<publish_id from step 8>\",
    \"research_brief_id\": \"$BRIEF_ID\",
    \"status\": \"completed\",
    \"completed_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
  }"
```

---

## Step 10: Analytics (Optional — run after video has views)

Ingest performance metrics and update topic scores.

```bash
curl -X POST $API/pipeline/analytics \
  -H "x-api-key: $KEY" \
  -H "Content-Type: application/json"
```

**Expected:** `{"snapshots_created": N, "topics_scored": N}`

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `401 Unauthorized` | Missing or wrong `x-api-key` header | Check `API_KEY` in `.env` matches your header |
| Voice returns 402 | ElevenLabs free tier | Upgrade to Starter plan ($5/mo) |
| Render fails with audio 400 | R2 public access not enabled | Enable R2.dev subdomain in Cloudflare dashboard |
| "No YouTube channel found" | Google account has no channel | Create one at youtube.com first |
| Assembly FK error | Transcription insert failed silently | Check OpenAI API key is valid, audio URL is accessible |
| Video shows text on black bg | Script has string visual_cues (old format) | Re-run ideation — new prompts produce structured objects |
| Ideation returns string visual_cue | Agent didn't follow prompt | The normalization fallback converts invalid objects to text_slide; strings pass through as-is for backward compat |
| Port 3001 not responding | Server not started or wrong port | Run `pnpm dev`, check `API_PORT=3001` in `.env` |
| YouTube publish fails | OAuth token expired | Hit `POST /youtube/refresh` or re-auth via `/youtube/auth` |

---

## Testing the Finance Niche

Run the same steps but change the niche in Step 3:

```bash
curl -X POST $API/pipeline/research \
  -H "x-api-key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"niche": "finance-education"}'
```

Finance videos use a green accent (#00ff88) instead of cyan, and the CTA includes a "not financial advice" disclaimer.
