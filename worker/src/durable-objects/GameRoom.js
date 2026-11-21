import { DurableObject } from "cloudflare:workers";
import { router } from "../routes/ws.gameroom.routes";

export class GameRoom extends DurableObject {
  async fetch(request) {
    // eslint-disable-next-line no-undef
    const [client, server] = Object.values(new WebSocketPair());

    const me = {
      role: request.headers.get("X-Role"),
      userId: request.headers.get("X-User-Id"),
      name: request.headers.get("X-Name"),
    };

    // Hibernation API
    this.ctx.acceptWebSocket(server, [me.role]);
    server.serializeAttachment(me);

    const status = (await this.ctx.storage.get("status")) ?? "lobby";
    server.send(JSON.stringify({ type: "welcome", you: me, status }));
    this.broadcastPresence();

    return new Response(null, { status: 101, webSocket: client });
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
