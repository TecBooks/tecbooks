export async function startGame({ room }) {
  await ws.ctx.storage.put("status", "running");
  ws.broadcast({ type: "game_started" });
}

export async function studentAction({ room, user, payload }) {
  room.broadcast({ type: "action", by: user.name, payload });
}
