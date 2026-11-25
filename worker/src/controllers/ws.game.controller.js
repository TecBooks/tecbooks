import {
  closeGameRoom,
  getCurrentGameForTeacher,
} from "../services/game-room.service.js";

export async function startGame({ room, user }) {
  const gameId = await room.ctx.storage.get("gameId");
  const gameState = await room.ctx.storage.get("gameState");

  if (gameState?.status === "running") {
    throw new Error("The game is already running");
  }
  if (gameState?.status === "game_over") {
    throw new Error("The game is over");
  }

  const { timeRoundSeconds, totalRounds } = await getCurrentGameForTeacher(
    room.env,
    gameId,
    Number(user.userId),
  );
  const serverNow = Date.now();
  const endsAt = serverNow + timeRoundSeconds * 1000;
  const nextState = {
    status: "running",
    currentRound: 1,
    totalRounds,
    timeRoundSeconds,
    endsAt,
  };

  await room.ctx.storage.put("gameState", nextState);
  await room.ctx.storage.setAlarm(endsAt);
  room.broadcast(roundStartedMessage(nextState, serverNow));
}

export async function endRound({ room }) {
  const gameState = await room.ctx.storage.get("gameState");
  if (gameState?.status !== "running") return;

  const serverNow = Date.now();
  if (gameState.endsAt > serverNow) {
    await room.ctx.storage.setAlarm(gameState.endsAt);
    return;
  }

  if (gameState.currentRound >= gameState.totalRounds) {
    const finishedState = { ...gameState, status: "game_over" };
    await room.ctx.storage.put("gameState", finishedState);
    // Persist only the end of the game to D1 (not every state change): the
    // join code stops working and the cron won't have to close it.
    await closeGameRoom(room.env, await room.ctx.storage.get("gameId"));
    room.broadcast({
      type: "game_over",
      currentRound: finishedState.currentRound,
      totalRounds: finishedState.totalRounds,
    });
    return;
  }

  const nextState = {
    ...gameState,
    currentRound: gameState.currentRound + 1,
    endsAt: serverNow + gameState.timeRoundSeconds * 1000,
  };
  await room.ctx.storage.put("gameState", nextState);
  await room.ctx.storage.setAlarm(nextState.endsAt);
  room.broadcast(roundStartedMessage(nextState, serverNow));
}

export async function studentAction({ room, user, payload }) {
  room.broadcast({ type: "action", by: user.name, payload });
}

function roundStartedMessage(gameState, serverNow) {
  return {
    type: "round_started",
    currentRound: gameState.currentRound,
    totalRounds: gameState.totalRounds,
    timeRoundSeconds: gameState.timeRoundSeconds,
    endsAt: gameState.endsAt,
    serverNow,
  };
}
