import { Hono } from "hono";
import { createLogger } from "@vectis/shared";
import { assemble } from "@vectis/assembly";

const log = createLogger("route:assembly");

export const assemblyRoute = new Hono();

assemblyRoute.post("/assemble", async (c) => {
  const { script_id, video_id, voice_asset_id, formats, include_hook_variants } =
    await c.req.json();

  if (!script_id || !video_id || !voice_asset_id) {
    return c.json({ error: "script_id, video_id, and voice_asset_id required" }, 400);
  }

  try {
    const jobs = await assemble({
      scriptId: script_id,
      videoId: video_id,
      voiceAssetId: voice_asset_id,
      formats,
      includeHookVariants: include_hook_variants,
    });

    log.info({ jobCount: jobs.length }, "Assembly complete");
    return c.json({ assembly_jobs: jobs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ error: message }, "Assembly failed");
    return c.json({ error: message }, 500);
  }
});
