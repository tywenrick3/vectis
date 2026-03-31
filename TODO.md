# Vectis — External Setup TODO

Everything outside of writing code. API accounts, credentials, infrastructure, and third-party configuration that needs to happen before each piece of the pipeline can run end-to-end.

---

## Critical / Do First

### 1. Fix Secret Exposure

- [ ] **Add `.env` to `.gitignore`** — your `.env` with Supabase keys and TikTok credentials is currently tracked by git. This is the highest priority item.
- [ ] **Rotate all committed secrets** — once `.env` is gitignored, every key that was ever committed (Supabase service role key, TikTok client secret, R2 keys) should be considered compromised. Regenerate them all.
- [ ] **Move hardcoded TikTok credentials to env vars** — `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET` are hardcoded in the publisher package. Pull them into `.env` and reference via config.

---

## API Keys & Account Setup

### 2. Anthropic (Claude) — *already partially set up*

- [ ] **Verify `ANTHROPIC_API_KEY` is active** — confirm the key in `.env` has billing enabled and sufficient credits
- [ ] **Set usage limits** — go to [console.anthropic.com](https://console.anthropic.com) → Settings → Limits. Set a monthly spend cap so runaway pipeline loops don't drain your balance
- [ ] **Check model access** — the codebase uses `claude-sonnet-4-20250514`. Confirm your plan tier has access to this model

### 3. Tavily (Web Search)

Tavily powers the research layer — trending topic discovery, competitor analysis, and saturation checks. This is a **P0 blocker** for the ideation agent upgrade.

- [ ] **Create a Tavily account** — sign up at [tavily.com](https://tavily.com)
- [ ] **Generate an API key** — Dashboard → API Keys → Create
- [ ] **Choose a plan** — the free tier gives 1,000 searches/month. For daily pipeline runs across multiple niches, estimate your volume:
  - ~3-5 searches per topic research cycle
  - If running 5 niches × 1 topic/day = ~25 searches/day = ~750/month (free tier may suffice for MVP)
  - If scaling beyond that, the Researcher plan ($100/mo) gives 10,000 searches
- [ ] **Add `TAVILY_API_KEY` to `.env`**
- [ ] **Add `TAVILY_API_KEY` to `packages/shared/src/config.ts`** env schema (implementation task, but config needs the var first)

### 4. ElevenLabs (Voice)

- [ ] **Create an ElevenLabs account** — sign up at [elevenlabs.io](https://elevenlabs.io)
- [ ] **Choose a plan** — pricing considerations:
  - Free tier: 10,000 characters/month (~10 minutes of audio). Enough for testing, not production.
  - Starter ($5/mo): 30,000 characters. Could handle ~1 video/day if scripts are tight.
  - Creator ($22/mo): 100,000 characters. Comfortable for daily multi-niche production.
  - The codebase uses `eleven_flash_v2_5` which is their fastest/cheapest model — good choice for volume.
- [ ] **Generate an API key** — Profile → API Keys
- [ ] **Select a voice** — this is important for brand consistency:
  - Go to Voice Library → browse/filter by language, accent, use case
  - For tech/finance explainer content, look for: clear, authoritative, mid-pace voices
  - Test 3-5 voices with a sample script before committing
  - Copy the Voice ID from the voice's settings page
- [ ] **Add `ELEVENLABS_API_KEY` to `.env`**
- [ ] **Add `ELEVENLABS_VOICE_ID` to `.env`**
- [ ] **Test the voice endpoint** — generate a short sample and listen before wiring into the pipeline. Use their playground first.

### 5. Cloudflare R2 (Object Storage)

- [ ] **Create a Cloudflare account** (if you don't have one) — [dash.cloudflare.com](https://dash.cloudflare.com)
- [ ] **Enable R2** — Dashboard → R2 → Get Started (requires adding a payment method, but R2 has a generous free tier: 10GB storage, 10M reads, 1M writes/month)
- [ ] **Create a bucket** named `vectis` — R2 → Create Bucket → name it `vectis`, choose a region close to your n8n server
- [ ] **Create an API token** — R2 → Manage R2 API Tokens → Create:
  - Permissions: Object Read & Write
  - Scope: limit to the `vectis` bucket only
  - Copy the Access Key ID and Secret Access Key
- [ ] **Set up a public domain (optional but recommended)** — R2 → `vectis` bucket → Settings → Public Access → Custom Domain. This gives you a clean CDN URL for serving assets.
- [ ] **Add to `.env`**:
  - `R2_ACCOUNT_ID` — found in Cloudflare dashboard URL or sidebar
  - `R2_ACCESS_KEY_ID`
  - `R2_SECRET_ACCESS_KEY`
  - `R2_BUCKET_NAME=vectis`
  - `R2_PUBLIC_URL` — your custom domain or the R2.dev URL

### 6. TikTok Developer App

- [ ] **Create a TikTok Developer account** — [developers.tiktok.com](https://developers.tiktok.com)
- [ ] **Register an app** — My Apps → Create. Select "Content Posting API" as the product.
- [ ] **Configure OAuth redirect** — set the redirect URI to match `TIKTOK_REDIRECT_URI` (e.g., `https://api.yourdomain.com/oauth/tiktok/callback`)
- [ ] **Request scopes**: `user.info.basic`, `video.publish`, `video.upload`
- [ ] **Submit for review** — TikTok requires app review before production access. This can take 1-5 business days. Plan accordingly.
  - Prepare a brief description of your use case
  - You may need to demonstrate the OAuth flow working
- [ ] **Regenerate client key and secret** (since the old ones were committed to git)
- [ ] **Add to `.env`**:
  - `TIKTOK_CLIENT_KEY`
  - `TIKTOK_CLIENT_SECRET`
  - `TIKTOK_REDIRECT_URI`
- [ ] **Complete the OAuth flow once** — after the API app is live, hit the `/oauth/tiktok` route to authorize your TikTok account. This stores refresh tokens in the `tiktok_credentials` table.

### 7. Supabase

- [ ] **Verify project is live** — the codebase points to `dgazlllfdukelyqmxogz.supabase.co`. Confirm this project exists and is on an active plan.
- [ ] **Run the initial migration** — execute `supabase/migrations/001_initial_schema.sql` against your project:
  - Supabase Dashboard → SQL Editor → paste and run, OR
  - Use Supabase CLI: `supabase db push`
- [ ] **Verify all 8 tables were created** — check the Table Editor for: `topics`, `scripts`, `voice_assets`, `videos`, `pipeline_runs`, `tiktok_credentials`, `analytics_snapshots`, and the `pipeline_status` enum
- [ ] **Regenerate the service role key** (since it was committed to git) — Settings → API → Service Role Key → Regenerate
- [ ] **Add to `.env`**:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- [ ] **Enable Row Level Security (RLS)** — even though you're using the service role key (which bypasses RLS), enable it as a safety net for when you add client-side access later
- [ ] **Set up database backups** — Supabase Pro plan includes daily backups. If on free tier, set up manual backup exports on a schedule.

---

## Infrastructure

### 8. n8n Deployment (Orchestration Server)

This is the brain that triggers the daily pipeline. Needs a VPS with Docker.

- [ ] **Provision a VPS** — options:
  - DigitalOcean Droplet: $6/mo (1 vCPU, 1GB RAM) is enough for n8n
  - AWS EC2 t3.micro: free tier eligible for 12 months
  - Hetzner: $4.50/mo for better specs if you're cost-conscious
  - Minimum: 1 vCPU, 1GB RAM, 20GB SSD
- [ ] **Point a domain to the VPS** — e.g., `n8n.yourdomain.com`. Add an A record in your DNS provider pointing to the VPS IP.
- [ ] **Install Docker + Docker Compose** on the VPS
- [ ] **Copy `infra/n8n/docker-compose.yml`** to the server
- [ ] **Create `.env` on the server** from `infra/n8n/.env.example`:
  - `POSTGRES_USER=n8n`
  - `POSTGRES_PASSWORD=` ← generate a strong password
  - `N8N_ENCRYPTION_KEY=` ← generate a 32-character random string (`openssl rand -hex 16`)
  - `N8N_DOMAIN=n8n.yourdomain.com`
  - `ACME_EMAIL=your@email.com` (for Let's Encrypt SSL)
- [ ] **Run `docker compose up -d`** and verify n8n is accessible at `https://n8n.yourdomain.com`
- [ ] **Create your n8n admin account** on first launch
- [ ] **Open firewall ports** — 80 (HTTP) and 443 (HTTPS) must be open for Traefik/Let's Encrypt
- [ ] **Add all Vectis API credentials to n8n** — n8n needs to call your Hono API, so configure the API_KEY and base URL as n8n credentials

### 9. Domain & DNS

- [ ] **Register or designate a domain** for the project (if you don't already own one)
- [ ] **Subdomains to plan for**:
  - `n8n.yourdomain.com` — n8n dashboard
  - `api.yourdomain.com` — Hono API (needed for TikTok OAuth redirect)
  - Optional: CDN subdomain for R2 public access
- [ ] **Set up DNS records** accordingly

### 10. API Server Deployment (Hono)

The Hono API needs to be publicly accessible for TikTok OAuth callbacks and n8n to call.

- [ ] **Choose a hosting approach**:
  - Same VPS as n8n (add to docker-compose, or run with PM2/systemd)
  - Serverless: Cloudflare Workers (Hono has native support), Vercel, or Railway
  - Separate VPS
- [ ] **Set up HTTPS** — required for TikTok OAuth
- [ ] **Set `API_KEY`** — generate a strong random token for authenticating n8n → API calls
- [ ] **Configure all env vars** on the production host

---

## Accounts to Create (Summary Checklist)

| Service | URL | Free Tier? | Estimated Monthly Cost |
|---------|-----|-----------|----------------------|
| Anthropic | console.anthropic.com | No (pay-as-you-go) | ~$5-20 depending on volume |
| Tavily | tavily.com | Yes (1K searches) | $0-100 |
| ElevenLabs | elevenlabs.io | Yes (10K chars) | $5-22 |
| Cloudflare | dash.cloudflare.com | Yes (10GB R2) | $0 |
| TikTok Dev | developers.tiktok.com | Yes | $0 |
| Supabase | supabase.com | Yes (500MB DB) | $0-25 |
| VPS Provider | varies | Sometimes | $4-12 |
| Domain Registrar | varies | No | ~$10-15/year |

**Estimated total for MVP**: ~$15-60/month + domain

---

## Post-MVP External Setup (for when you get there)

### YouTube Shorts Publishing
- [ ] Create a Google Cloud project at [console.cloud.google.com](https://console.cloud.google.com)
- [ ] Enable the YouTube Data API v3
- [ ] Configure OAuth consent screen (will require Google review for `youtube.upload` scope)
- [ ] Create OAuth 2.0 credentials
- [ ] Note: Google's review process for YouTube upload scope can take weeks. Start this early if YouTube is a near-term priority.

### Instagram Reels Publishing
- [ ] Create a Meta Developer account at [developers.facebook.com](https://developers.facebook.com)
- [ ] Create a Meta App with Instagram Graph API access
- [ ] Connect a professional Instagram account
- [ ] Note: Requires a Facebook Page linked to the Instagram account

### Auto-Captions (Whisper)
- [ ] Decide: OpenAI Whisper API ($0.006/min) vs. self-hosted whisper.cpp (free, needs GPU or patience)
- [ ] If API: add OpenAI API key to env
- [ ] If self-hosted: ensure your rendering server has adequate compute

### AI Video Generation
- [ ] Kling AI — apply for API access at [klingai.com](https://klingai.com)
- [ ] Runway — apply for API access at [runwayml.com](https://runwayml.com)
- [ ] Veo — Google DeepMind, access via Vertex AI

---

## Recommended Order of Operations

1. **Fix `.gitignore` and rotate secrets** — stop the bleeding
2. **Supabase** — run migration, verify tables exist
3. **Anthropic** — verify key, test ideation pipeline locally
4. **ElevenLabs** — create account, pick a voice, test voice generation
5. **Cloudflare R2** — create bucket, test upload from voice package
6. **Tavily** — create account, get key (blocks the research package)
7. **Domain + VPS** — provision infrastructure
8. **n8n** — deploy, build first workflow
9. **TikTok Dev App** — submit for review early (has a review queue)
10. **Hono API deployment** — put API online, wire up OAuth
11. **End-to-end test** — trigger full pipeline from n8n
