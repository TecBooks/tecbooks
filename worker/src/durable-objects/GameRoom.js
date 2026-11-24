import { DurableObject } from "cloudflare:workers";
import { endRound } from "../controllers/ws.game.controller.js";
import { router } from "../routes/ws.gameroom.routes";

export class GameRoom extends DurableObject {
  async fetch(request) {
    const gameId = Number(request.headers.get("X-Game-Id"));
    console.log({ gameId });
    if (!Number.isInteger(gameId) || gameId <= 0) {
      return new Response("Invalid game room", { status: 400 });
    }

    // eslint-disable-next-line no-undef
    const [client, server] = Object.values(new WebSocketPair());

    const me = {
      role: request.headers.get("X-Role"),
      userId: request.headers.get("X-User-Id"),
      name: request.headers.get("X-Name"),
      gameId,
    };
    const projectSelection = {
      programId: Number(request.headers.get("X-Program-Id")),
      programName: decodeURIComponent(
        request.headers.get("X-Program-Name") ?? "",
      ),
      projectId: Number(request.headers.get("X-Project-Id")),
      projectName: decodeURIComponent(
        request.headers.get("X-Project-Name") ?? "",
      ),
      gameId: Number(request.headers.get("X-Project-Game-Id")),
    };
    const hasProjectSelection =
      Number.isInteger(projectSelection.programId) &&
      projectSelection.programId > 0 &&
      Number.isInteger(projectSelection.projectId) &&
      projectSelection.projectId > 0 &&
      Number.isInteger(projectSelection.gameId) &&
      projectSelection.gameId > 0;

    // Hibernation API
    this.ctx.acceptWebSocket(server, [me.role]);
    server.serializeAttachment(me);

    await this.ctx.storage.put("gameId", gameId);
    const gameState = await this.ctx.storage.get("gameState");
    const status = gameState?.status ?? "lobby";
    server.send(
      JSON.stringify({
        type: "welcome",
        you: me,
        status,
        projectSelection: hasProjectSelection ? projectSelection : null,
      }),
    );
    if (gameState?.status === "running") {
      server.send(
        JSON.stringify({
          type: "round_started",
          currentRound: gameState.currentRound,
          totalRounds: gameState.totalRounds,
          timeRoundSeconds: gameState.timeRoundSeconds,
          endsAt: gameState.endsAt,
          serverNow: Date.now(),
        }),
      );
    } else if (gameState?.status === "game_over") {
      server.send(
        JSON.stringify({
          type: "game_over",
          currentRound: gameState.currentRound,
          totalRounds: gameState.totalRounds,
        }),
      );
    }
    this.broadcastPresence();

    return new Response(null, { status: 101, webSocket: client });
  }

  async alarm() {
    await endRound({ room: this });
  }

  async webSocketMessage(ws, message) {
    await router.dispatch(this, ws, message);
  }

  async webSocketClose(ws, code) {
    try {
      ws.close(code, "closing");
    } catch {
      console.error("Error closing websocket");
    } // some codes (1005/1006) can't be echoed back
    this.broadcastPresence(ws);
  }

  async webSocketError(ws) {
    this.broadcastPresence(ws);
  }

  // Unique connected users, excluding a socket that is closing
  online(exclude) {
    const seen = new Map();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue;
      const who = ws.deserializeAttachment();
      if (who) seen.set(`${who.role}:${who.userId}`, who);
    }
    return [...seen.values()];
  }

  broadcastPresence(exclude) {
    this.broadcast({ type: "presence", online: this.online(exclude) }, exclude);
  }

  broadcast(obj, exclude) {
    const data = JSON.stringify(obj);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue;
      try {
        ws.send(data);
      } catch {
        console.log("Error broadcasting to a socket");
      }
    }
  }
}
