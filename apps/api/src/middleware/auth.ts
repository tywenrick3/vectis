import { createMiddleware } from "hono/factory";
import { getEnv } from "@vectis/shared";

export const apiKeyAuth = createMiddleware(async (c, next) => {
  const apiKey = c.req.header("x-api-key");
  const env = getEnv();

  if (!apiKey || apiKey !== env.API_KEY) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
});
