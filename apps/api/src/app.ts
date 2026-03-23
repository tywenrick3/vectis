import { Hono } from "hono";
import { apiKeyAuth } from "./middleware/auth.js";
import { ideateRoute } from "./routes/ideate.js";
import { voiceRoute } from "./routes/voice.js";
import { renderRoute } from "./routes/render.js";
import { publishRoute } from "./routes/publish.js";
import { analyticsRoute } from "./routes/analytics.js";
import { oauthRoute } from "./routes/oauth.js";

export const app = new Hono();

// Health check (no auth)
app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

// Protected routes
app.use("/ideate/*", apiKeyAuth);
app.use("/voice/*", apiKeyAuth);
app.use("/render/*", apiKeyAuth);
app.use("/publish/*", apiKeyAuth);
app.use("/analytics/*", apiKeyAuth);

app.route("/ideate", ideateRoute);
app.route("/voice", voiceRoute);
app.route("/render", renderRoute);
app.route("/publish", publishRoute);
app.route("/analytics", analyticsRoute);
app.route("/oauth", oauthRoute);
