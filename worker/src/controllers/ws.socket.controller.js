import { broadcastPresence } from "./ws.game.controller.js";
import {
  getRoomState,
  getTeamMembers,
} from "../services/team-assignment.service.js";

export async function connectSocket(room, request) {
  const gameId = Number(request.headers.get("X-Game-Id"));
  console.log({ gameId });
  if (!Number.isInteger(gameId) || gameId <= 0) {
    return new Response("Invalid game room", { status: 400 });
  }

  const teamCount = Number(request.headers.get("X-Num-Teams"));
  if (!Number.isInteger(teamCount) || teamCount < 2) {
    return new Response("Invalid team settings", { status: 400 });
  }

  const me = {
    role: request.headers.get("X-Role"),
    userId: request.headers.get("X-User-Id"),
    name: request.headers.get("X-Name"),
    gameId,
  };
  const { teamState, gameState } = await getRoomState(room.ctx.storage, {
    teamCount,
    user: me,
  });
  if (me.role === "student") {
    me.teamId = teamState.assignments[me.userId];
  }
  const status = gameState?.status ?? "lobby";

  // eslint-disable-next-line no-undef
  const [client, server] = Object.values(new WebSocketPair());
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

  room.ctx.acceptWebSocket(server, [me.role]);
  server.serializeAttachment(me);

  await room.ctx.storage.put("gameId", gameId);
  server.send(
    JSON.stringify({
      type: "welcome",
      you: me,
      status,
      teams: teamState.teams,
      teamMembers: getTeamMembers(teamState),
      teamAssignments: teamState.assignments,
      allowTeamChanges: teamState.allowStudentChanges,
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
  await broadcastPresence({ room });

  return new Response(null, { status: 101, webSocket: client });
}
