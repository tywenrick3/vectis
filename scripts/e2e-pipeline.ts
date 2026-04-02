#!/usr/bin/env tsx

// Vectis E2E Pipeline Test
// Runs the full pipeline against a live server: research → ideate → voice → render → assemble → publish → record-run
// Usage: tsx scripts/e2e-pipeline.ts [--dry-run] [--niche <name>]

import { execFileSync, spawn, type ChildProcess } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ── Config ──────────────────────────────────────────────────────────

const API_PORT = process.env.API_PORT ?? "3001";
const API_URL = process.env.API_URL ?? `http://localhost:${API_PORT}`;
const API_KEY = process.env.API_KEY;
const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ── ANSI helpers ────────────────────────────────────────────────────

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

// ── Types ───────────────────────────────────────────────────────────

interface PipelineState {
  niche: string;
  research_brief_id?: string;
  topic_id?: string;
  script_id?: string;
  title?: string;
  voice_asset_id?: string;
  audio_url?: string;
  duration_ms?: number;
  video_id?: string;
  video_url?: string;
  assembly_job_ids?: string[];
  primary_output_url?: string | null;
  publish_id?: string;
  pipeline_run_id?: string;
}

interface StageResult {
  name: string;
  elapsed: number;
  skipped: boolean;
}

// ── CLI args ────────────────────────────────────────────────────────

function parseArgs(): { dryRun: boolean; niche: string } {
  const args = process.argv.slice(2).filter((a) => a !== "--");

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
${bold("Vectis E2E Pipeline Test")}

${bold("Usage:")} tsx scripts/e2e-pipeline.ts [options]

${bold("Options:")}
  --dry-run          Skip publish + record-run (stages 1-5 only)
  --niche <name>     Niche to test (default: "tech-explainer")
  --help, -h         Show this help

${bold("Environment:")}
  API_URL            Server URL (default: http://localhost:3001)
  API_KEY            Required. API key for x-api-key header

${bold("Examples:")}
  pnpm e2e                                    # full run
  pnpm e2e:dry                                # dry run
  pnpm e2e -- --niche finance-education       # different niche
`);
    process.exit(0);
  }

  const dryRun = args.includes("--dry-run");
  const nicheIdx = args.indexOf("--niche");
  const niche = nicheIdx !== -1 && args[nicheIdx + 1] ? args[nicheIdx + 1] : "tech-explainer";

  return { dryRun, niche };
}

// ── HTTP helper ─────────────────────────────────────────────────────

async function apiCall(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
  timeoutMs = 60_000,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(API_KEY ? { "x-api-key": API_KEY } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      signal: controller.signal,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const json = (await res.json()) as Record<string, unknown>;

    if (!res.ok) {
      const msg = (json.error as string) ?? `HTTP ${res.status}`;
      throw new Error(msg);
    }

    return json;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── Validation ──────────────────────────────────────────────────────

function assertField(
  obj: Record<string, unknown>,
  field: string,
  type: "string" | "number" | "array",
): void {
  const val = obj[field];
  if (type === "array") {
    if (!Array.isArray(val)) {
      throw new Error(`Expected "${field}" to be an array, got ${typeof val}`);
    }
  } else if (typeof val !== type) {
    throw new Error(
      `Expected "${field}" to be ${type}, got ${typeof val}: ${JSON.stringify(val)}`,
    );
  }
}

// ── Timing ──────────────────────────────────────────────────────────

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

// ── Stage runner ────────────────────────────────────────────────────

const results: StageResult[] = [];

async function runStage(
  index: number,
  total: number,
  name: string,
  state: PipelineState,
  fn: (state: PipelineState) => Promise<void>,
): Promise<void> {
  const tag = `[${index}/${total}]`;
  console.log(`\n${bold(cyan(tag))} ${bold(name)} — Starting...`);

  const start = Date.now();
  try {
    await fn(state);
    const elapsed = Date.now() - start;
    results.push({ name, elapsed, skipped: false });
    console.log(`${bold(cyan(tag))} ${bold(name)} — ${green("OK")} ${dim(`(${formatElapsed(elapsed)})`)}`);
  } catch (err: unknown) {
    const elapsed = Date.now() - start;
    results.push({ name, elapsed, skipped: false });
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${bold(cyan(tag))} ${bold(name)} — ${red("FAILED")} ${dim(`(${formatElapsed(elapsed)})`)}`);
    console.error(`      ${red("Error:")} ${msg}`);
    console.error(`\n      ${dim("State at failure:")}`);
    console.error(dim(JSON.stringify(state, null, 2).replace(/^/gm, "      ")));
    process.exit(1);
  }
}

function skipStage(index: number, total: number, name: string): void {
  const tag = `[${index}/${total}]`;
  console.log(`\n${bold(cyan(tag))} ${bold(name)} — ${yellow("SKIPPED")} ${dim("(dry-run)")}`);
  results.push({ name, elapsed: 0, skipped: true });
}

// ── Preflight ───────────────────────────────────────────────────────

async function preflight(dryRun: boolean): Promise<void> {
  // Health check
  process.stdout.write(`${dim("[preflight]")} Health check... `);
  const start = Date.now();
  const health = await apiCall("GET", "/health");
  if (health.status !== "ok") throw new Error(`Unexpected health status: ${health.status}`);
  console.log(`${green("OK")} ${dim(`(${formatElapsed(Date.now() - start)})`)}`);

  // YouTube status (only matters for full runs)
  if (!dryRun) {
    process.stdout.write(`${dim("[preflight]")} YouTube status... `);
    const ytStart = Date.now();
    const yt = await apiCall("GET", "/youtube/status");

    if (!yt.connected) {
      console.log(red("NOT CONNECTED"));
      console.error(`\n${red("YouTube is not connected.")} Visit ${cyan(`${API_URL}/youtube/auth`)} in your browser to authenticate.`);
      process.exit(1);
    }

    if (!yt.token_valid) {
      process.stdout.write(`${yellow("expired, refreshing...")} `);
      await apiCall("POST", "/youtube/refresh");
    }

    console.log(`${green("CONNECTED")} ${dim(`(channel: ${yt.channel_id})`)} ${dim(`(${formatElapsed(Date.now() - ytStart)})`)}`);
  }
}

// ── Pipeline stages ─────────────────────────────────────────────────

async function stageResearch(state: PipelineState): Promise<void> {
  const data = await apiCall("POST", "/pipeline/research", { niche: state.niche });
  assertField(data, "research_brief_id", "string");
  assertField(data, "niche", "string");
  state.research_brief_id = data.research_brief_id as string;
  console.log(`      research_brief_id: ${dim(state.research_brief_id)}`);
}

async function stageIdeate(state: PipelineState): Promise<void> {
  const data = await apiCall("POST", "/pipeline/ideate", {
    research_brief_id: state.research_brief_id,
  });
  assertField(data, "topic_id", "string");
  assertField(data, "script_id", "string");
  assertField(data, "title", "string");
  state.topic_id = data.topic_id as string;
  state.script_id = data.script_id as string;
  state.title = data.title as string;
  console.log(`      topic_id:  ${dim(state.topic_id)}`);
  console.log(`      script_id: ${dim(state.script_id)}`);
  console.log(`      title:     ${dim(`"${state.title}"`)}`);
}

async function stageVoice(state: PipelineState): Promise<void> {
  const data = await apiCall("POST", "/pipeline/generate-voice", {
    script_id: state.script_id,
  });
  assertField(data, "voice_asset_id", "string");
  assertField(data, "audio_url", "string");
  assertField(data, "duration_ms", "number");
  state.voice_asset_id = data.voice_asset_id as string;
  state.audio_url = data.audio_url as string;
  state.duration_ms = data.duration_ms as number;
  console.log(`      voice_asset_id: ${dim(state.voice_asset_id)}`);
  console.log(`      audio_url:      ${dim(state.audio_url)}`);
  console.log(`      duration:       ${dim(formatElapsed(state.duration_ms))}`);
}

async function stageRender(state: PipelineState): Promise<void> {
  const data = await apiCall(
    "POST",
    "/pipeline/render-video",
    { script_id: state.script_id, voice_asset_id: state.voice_asset_id },
    300_000, // 5 min timeout
  );
  assertField(data, "video_id", "string");
  assertField(data, "video_url", "string");
  assertField(data, "duration_ms", "number");
  state.video_id = data.video_id as string;
  state.video_url = data.video_url as string;
  console.log(`      video_id:  ${dim(state.video_id)}`);
  console.log(`      video_url: ${dim(state.video_url)}`);
}

async function stageAssemble(state: PipelineState): Promise<void> {
  const data = await apiCall(
    "POST",
    "/pipeline/assemble",
    {
      script_id: state.script_id,
      video_id: state.video_id,
      voice_asset_id: state.voice_asset_id,
    },
    300_000, // 5 min timeout
  );
  assertField(data, "assembly_job_ids", "array");
  assertField(data, "jobs", "array");
  state.assembly_job_ids = data.assembly_job_ids as string[];
  state.primary_output_url = (data.primary_output_url as string | null) ?? null;
  console.log(`      assembly_job_ids:  ${dim(JSON.stringify(state.assembly_job_ids))}`);
  console.log(`      primary_output_url: ${dim(String(state.primary_output_url))}`);
}

async function stagePublish(state: PipelineState): Promise<void> {
  const data = await apiCall(
    "POST",
    "/pipeline/publish",
    { video_id: state.video_id, script_id: state.script_id, platform: "youtube" },
    120_000, // 2 min timeout
  );
  assertField(data, "publish_id", "string");
  assertField(data, "platform", "string");
  state.publish_id = data.publish_id as string;
  console.log(`      publish_id: ${dim(state.publish_id)}`);
  console.log(`      platform:   ${dim(data.platform as string)}`);
}

async function stageRecordRun(state: PipelineState): Promise<void> {
  const data = await apiCall("POST", "/pipeline/record-run", {
    niche: state.niche,
    topic_id: state.topic_id,
    script_id: state.script_id,
    voice_asset_id: state.voice_asset_id,
    video_id: state.video_id,
    youtube_publish_id: state.publish_id,
    research_brief_id: state.research_brief_id,
    status: "completed",
    completed_at: new Date().toISOString(),
  });
  assertField(data, "pipeline_run_id", "string");
  state.pipeline_run_id = data.pipeline_run_id as string;
  console.log(`      pipeline_run_id: ${dim(state.pipeline_run_id)}`);
}

// ── Summary ─────────────────────────────────────────────────────────

function printSummary(totalStart: number, dryRun: boolean): void {
  const totalElapsed = Date.now() - totalStart;
  const executed = results.filter((r) => !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;

  const sep = "=".repeat(50);
  console.log(`\n${bold(sep)}`);
  console.log(
    `  ${green(bold("PASS"))} — Pipeline completed in ${bold(formatElapsed(totalElapsed))}`,
  );
  console.log(
    `  Stages: ${executed} executed${skipped ? `, ${skipped} skipped` : ""}${dryRun ? ` ${dim("(dry-run)")}` : ""}`,
  );
  console.log(bold(sep));
}

// ── Server management ──────────────────────────────────────────────

let serverProcess: ChildProcess | null = null;

function killExistingServer(): void {
  try {
    const pids = execFileSync("lsof", ["-ti", `:${API_PORT}`], { encoding: "utf-8" }).trim();
    if (pids) {
      process.stdout.write(`${dim("[server]")} Killing existing process on port ${API_PORT}... `);
      execFileSync("kill", ["-9", ...pids.split("\n")]);
      console.log(green("done"));
    }
  } catch {
    // No process on port — that's fine
  }
}

function startServer(): ChildProcess {
  process.stdout.write(`${dim("[server]")} Starting API server... `);
  const child = spawn("pnpm", ["--filter", "@vectis/api", "dev"], {
    cwd: ROOT_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });
  child.stdout?.on("data", () => {}); // drain
  child.stderr?.on("data", () => {}); // drain
  return child;
}

async function waitForHealthy(timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${API_URL}/health`);
      if (res.ok) {
        console.log(green("ready"));
        return;
      }
    } catch {
      // Server not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`API server did not become healthy within ${timeoutMs / 1000}s`);
}

async function restartServer(): Promise<void> {
  killExistingServer();
  serverProcess = startServer();
  await waitForHealthy();
}

function cleanup(): void {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
}

process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(130); });
process.on("SIGTERM", () => { cleanup(); process.exit(143); });

// ── Main ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { dryRun, niche } = parseArgs();

  if (!API_KEY) {
    console.error(red("API_KEY environment variable is required."));
    console.error(dim("Set it in your .env or export it: export API_KEY=<your-key>"));
    process.exit(1);
  }

  const totalStages = dryRun ? 5 : 7;

  const sep = "=".repeat(50);
  console.log(bold(sep));
  console.log(`  ${bold("Vectis E2E Pipeline Test")}`);
  console.log(`  API:   ${cyan(API_URL)}`);
  console.log(`  Niche: ${cyan(niche)}`);
  console.log(`  Mode:  ${dryRun ? yellow("dry-run") : green("full")}`);
  console.log(bold(sep));

  await restartServer();

  const totalStart = Date.now();
  const state: PipelineState = { niche };

  await preflight(dryRun);

  await runStage(1, totalStages, "research", state, stageResearch);
  await runStage(2, totalStages, "ideate", state, stageIdeate);
  await runStage(3, totalStages, "voice", state, stageVoice);
  await runStage(4, totalStages, "render", state, stageRender);
  await runStage(5, totalStages, "assemble", state, stageAssemble);

  if (dryRun) {
    skipStage(6, totalStages, "publish");
    skipStage(7, totalStages, "record-run");
  } else {
    await runStage(6, totalStages, "publish", state, stagePublish);
    await runStage(7, totalStages, "record-run", state, stageRecordRun);
  }

  printSummary(totalStart, dryRun);
}

main();
