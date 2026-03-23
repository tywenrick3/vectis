import "dotenv/config";
import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { getEnv, createLogger } from "@vectis/shared";

const log = createLogger("api");

const env = getEnv();
const port = env.API_PORT;

serve({ fetch: app.fetch, port }, (info) => {
  log.info({ port: info.port }, "Vectis API running");
});
