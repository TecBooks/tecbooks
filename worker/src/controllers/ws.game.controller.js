import { getCurrentGameForTeacher } from "../services/game-room.service.js";
import {
  assignStudent,
  assertStudentCanChooseTeam,
  getTeamMembers,
  getTeamState,
} from "../services/team-assignment.service.js";

export async function broadcastPresence({ room, exclude }) {
  const teamState = await getTeamState(room.ctx.storage);
  room.broadcast(
    {
      type: "presence",
      online: room.online(exclude),
      teams: teamState?.teams ?? [],
      teamMembers: teamState ? getTeamMembers(teamState) : [],
      teamAssignments: teamState?.assignments ?? {},
      allowTeamChanges: teamState?.allowStudentChanges ?? false,
    },
    exclude,
  );
}

export async function updateTeamState({ room, update }) {
  const teamState = await room.ctx.storage.transaction(async (transaction) => {
    const current = await transaction.get("teamState");
    const next = await update(current, (key) => transaction.get(key));
    await transaction.put("teamState", next);
    return next;
  });
  await publishTeamState({ room, teamState });
}

export async function startGameState({ room, gameState }) {
  const teamState = await room.ctx.storage.transaction(async (transaction) => {
    const current = await transaction.get("gameState");
    if ((current?.status ?? "lobby") !== "lobby") {
      throw new Error("The game cannot be started from its current state");
    }

    const currentTeams = await transaction.get("teamState");
    const nextTeams = { ...currentTeams, allowStudentChanges: false };
    await transaction.put("teamState", nextTeams);
    await transaction.put("gameState", gameState);
    return nextTeams;
  });
  await publishTeamState({ room, teamState });
}

export async function publishTeamState({ room, teamState }) {
  for (const ws of room.ctx.getWebSockets()) {
    const user = ws.deserializeAttachment();
    if (user?.role === "student") {
      user.teamId = teamState.assignments[user.userId] ?? null;
      ws.serializeAttachment(user);
    }
  }
  await broadcastPresence({ room });
}

export async function assignStudentToTeam({ room, payload }) {
  await updateTeamState({
    room,
    update: async (teamState, get) => {
      const gameState = await get("gameState");
      if ((gameState?.status ?? "lobby") !== "lobby") {
        throw new Error("Teams cannot be changed after the game starts");
      }
      if (
        !Object.prototype.hasOwnProperty.call(
          teamState.assignments,
          payload.studentId,
        )
      ) {
        throw new Error("Student is not connected to this game");
      }

      return assignStudent(teamState, payload.studentId, payload.teamId);
    },
  });
}

export async function setStudentTeamChanges({ room, payload }) {
  if (typeof payload.enabled !== "boolean") {
    throw new Error("Team change setting must be a boolean");
  }

  await updateTeamState({
    room,
    update: async (teamState, get) => {
      const gameState = await get("gameState");
      if ((gameState?.status ?? "lobby") !== "lobby") {
        throw new Error(
          "Team changes can only be configured before the game starts",
        );
      }
      return {
        ...teamState,
        allowStudentChanges: payload.enabled,
      };
    },
  });
}

export async function chooseStudentTeam({ room, user, payload }) {
  await updateTeamState({
    room,
    update: async (teamState, get) => {
      const gameState = await get("gameState");
      assertStudentCanChooseTeam(teamState, gameState?.status ?? "lobby");
      return assignStudent(teamState, user.userId, payload.teamId);
    },
  });
}

export async function startGame({ room, user }) {
  const gameId = await room.ctx.storage.get("gameId");
  const gameState = await room.ctx.storage.get("gameState");

  if (gameState?.status === "running") {
    throw new Error("The game is already running");
  }
  if (gameState?.status === "game_over") {
    throw new Error("The game is over");
  }
  if ((gameState?.status ?? "lobby") !== "lobby") {
    throw new Error("The game cannot be started from its current state");
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

  await startGameState({ room, gameState: nextState });
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
