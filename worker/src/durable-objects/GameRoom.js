import { DurableObject } from "cloudflare:workers";
import {
  broadcastPresence,
  endRound,
} from "../controllers/ws.game.controller.js";
import { connectSocket } from "../controllers/ws.socket.controller.js";
import { router } from "../routes/ws.gameroom.routes";

export class GameRoom extends DurableObject {
  async fetch(request) {
    return connectSocket(this, request);
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
    await broadcastPresence({ room: this, exclude: ws });
  }

  async webSocketError(ws) {
    await broadcastPresence({ room: this, exclude: ws });
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
