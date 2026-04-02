# Vectis

Automated short-form video pipeline: research → ideation → voice → video → assembly → publish → analytics.

## Monorepo Layout

pnpm workspaces + Turborepo. All packages under `packages/`, one app under `apps/`.

```
packages/
  shared/       — Types, config (Zod), Supabase client, logger (pino), retry util
  research/     — Tavily search/extract → builds ResearchBrief
  ideation/     — Claude-powered topic generation, script writing, agentic ideation
  voice/        — ElevenLabs TTS → S3
  video/        — Remotion compositions, visual cue renderers → S3
  assembly/     — FFmpeg transcription overlay, multi-format (9:16, 16:9, 1:1), hook variants
  publisher/    — YouTube + TikTok upload via OAuth
  analytics/    — Metrics ingestion + topic scoring
apps/
  api/          — Hono HTTP API, pipeline routes orchestrate the full flow
```

## Commands

```bash
pnpm install          # install all deps
pnpm build            # turbo build (tsc) all packages
pnpm typecheck        # turbo typecheck all packages
pnpm test             # turbo test (vitest) all packages
pnpm dev              # turbo dev (watch mode)
```

Run a single package: `pnpm --filter @vectis/<pkg> <script>`

## Key Conventions

- **TypeScript, ESM everywhere.** All packages use `"type": "module"`.
- **Extensionless `.js` imports in Remotion code.** Remotion's webpack config requires imports like `./Foo.js` not `./Foo` or `./Foo.tsx`. This applies to anything under `packages/video/`.
- **Supabase is the DB.** All data access goes through `@vectis/shared`'s `getDb()` (Supabase client). No ORM.
- **S3 for media storage.** Voice audio, rendered video, and assembly outputs are uploaded to S3.
- **Structured visual cues.** `ScriptSegment.visual_cue` is a `string | VisualCue` union. Visual cue types: `animated_counter`, `bar_chart`, `comparison`, `stat_callout`, `list_reveal`, `text_slide`, `pie_chart`, `timeline`. Renderers live in `packages/video/src/compositions/visuals/`.
- **Niche-based prompts.** LLM system prompts are keyed by niche (e.g. `"tech-explainer"`, `"finance-education"`) in `packages/ideation/src/prompts/`. New niches = new prompt file + register in `prompts/index.ts`.
- **JSON-only LLM output.** All Claude calls enforce JSON-only responses (no markdown fences). Parse with `JSON.parse()` directly.
- **Pino for logging.** Use `createLogger("package:context")` from shared.

## External Services

- **Anthropic (Claude)** — Ideation: topic generation, script writing, agentic research+write loop
- **Tavily** — Web search and URL extraction for research briefs
- **ElevenLabs** — Text-to-speech synthesis
- **Supabase** — Postgres DB + auth
- **AWS S3** — Media file storage
- **YouTube Data API / TikTok** — Video publishing
- **Remotion** — Programmatic video rendering (React)

## Pipeline Flow

The API (`apps/api/`) exposes per-stage endpoints. A full run:

1. `POST /pipeline/research` — Tavily search → `ResearchBrief`
2. `POST /pipeline/ideate` — Claude agent (tools: search, extract, score_lookup) → `Topic` + `Script`
3. `POST /pipeline/generate-voice` — ElevenLabs → `VoiceAsset` (S3)
4. `POST /pipeline/render-video` — Remotion render → `VideoAsset` (S3)
5. `POST /pipeline/assemble` — FFmpeg caption overlay + multi-format → `AssemblyJob[]` (S3)
6. `POST /pipeline/publish` — Upload to YouTube/TikTok
7. `POST /pipeline/analytics` — Ingest metrics + rescore topics
