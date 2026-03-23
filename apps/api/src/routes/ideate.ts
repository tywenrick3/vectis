import { Hono } from "hono";
import { getDb, createLogger } from "@vectis/shared";
import { generateTopics, writeScript } from "@vectis/ideation";

const log = createLogger("route:ideate");

export const ideateRoute = new Hono();

ideateRoute.post("/", async (c) => {
  const db = getDb();
  const body = await c.req.json().catch(() => ({}));
  const niche = body.niche ?? "tech-explainer";

  try {
    // Create pipeline run
    const { data: run, error: runError } = await db
      .from("pipeline_runs")
      .insert({ status: "ideating" })
      .select()
      .single();

    if (runError) throw new Error(runError.message);

    // Pick an unused topic or generate new ones
    let { data: topic } = await db
      .from("topics")
      .select()
      .eq("niche", niche)
      .eq("used", false)
      .order("score", { ascending: false })
      .limit(1)
      .single();

    if (!topic) {
      const topics = await generateTopics(niche);
      topic = topics[0];
    }

    // Write script
    const script = await writeScript(topic);

    // Update pipeline run
    await db
      .from("pipeline_runs")
      .update({
        topic_id: topic.id,
        script_id: script.id,
        status: "pending",
      })
      .eq("id", run.id);

    log.info({ runId: run.id, scriptId: script.id }, "Ideation complete");

    return c.json({
      pipeline_run_id: run.id,
      topic_id: topic.id,
      script_id: script.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ error: message }, "Ideation failed");
    return c.json({ error: message }, 500);
  }
});
