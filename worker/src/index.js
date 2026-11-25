import { Hono } from "hono";
import { cors } from "hono/cors";
import { errorHandler } from "./middleware/error-handler.middleware.js";
import { healthRoute } from "./routes/health.route.js";
import apiRoutes from "./routes/router.js";
import { websocketRoute } from "./routes/websocket.route.js";
import { GameRoom } from "./durable-objects/GameRoom.js";
import { closeStaleGameRooms } from "./services/game-room.service.js";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: (origin) => origin,
    credentials: true,
  }),
);
app.onError(errorHandler);

app.route("/health", healthRoute);
app.route("/api", apiRoutes);
app.route("/ws", websocketRoute);

// Cron (wrangler.jsonc → triggers.crons): close abandoned game rooms so their
// join codes stop working. One request + one UPDATE per day.
async function scheduled(_controller, env, ctx) {
  ctx.waitUntil(
    closeStaleGameRooms(env).then((closed) =>
      console.log(`[cron] closed ${closed} stale game room(s)`),
    ),
  );
}

export { GameRoom };
export default { fetch: app.fetch, scheduled };
