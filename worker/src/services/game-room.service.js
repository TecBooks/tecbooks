import {
  closeGameRoomById,
  closeGameRoomsCreatedBefore,
  findActiveGameRoomForTeacher,
} from "../models/game-room.model.js";

// Rooms nobody finished (teacher left mid-lobby, etc.) get closed by the cron
// after this long, so their join code stops working.
export const STALE_ROOM_MAX_AGE_HOURS = 24;

export async function closeGameRoom(env, gameId) {
  await closeGameRoomById(env.DB, gameId, new Date().toISOString());
}

export async function closeStaleGameRooms(env, now = Date.now()) {
  const cutoff = new Date(
    now - STALE_ROOM_MAX_AGE_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const result = await closeGameRoomsCreatedBefore(
    env.DB,
    cutoff,
    new Date(now).toISOString(),
  );
  return result?.meta?.changes ?? 0;
}

export async function getCurrentGameForTeacher(env, gameId, teacherId) {
  const game = await findActiveGameRoomForTeacher(env.DB, gameId, teacherId);
  if (!game) throw new Error("Active game room not found for teacher");

  if (
    !Number.isInteger(game.time_round) ||
    game.time_round <= 0 ||
    !Number.isInteger(game.num_rounds) ||
    game.num_rounds <= 0
  ) {
    throw new Error("Game room has invalid round settings");
  }

  return {
    timeRoundSeconds: game.time_round,
    totalRounds: game.num_rounds,
  };
}

export async function createGameRoom(c, roomData, projectIds) {
  // console.log({ roomData, projectIds });
  const { code, name, userId, numTeams, timePerRound } = roomData;
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO game_rooms (code, game_name, created_by, created_at, n_teams, time_round)
       VALUES (?,?,?,?,?,?)`,
    ).bind(
      code,
      name,
      userId,
      new Date().toISOString(),
      numTeams,
      timePerRound,
    ),

    ...projectIds.map((projectId) =>
      c.env.DB.prepare(
        `INSERT INTO game_project (game_id, project_id)
         SELECT game_id, ? FROM game_rooms WHERE code = ?`,
      ).bind(projectId, code),
    ),
  ]);
}

export async function validateProjects(c, placeholders, projectIds, createdBy) {
  return await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT project.id) AS n
     FROM feasibility_projects AS project
     JOIN feasibility_programs AS program ON program.id = project.program_id
     WHERE project.id IN (${placeholders}) AND program.created_by = ?`,
  )
    .bind(...projectIds, createdBy)
    .all();
}

export async function findActiveGameRoom(db, code) {
  return db
    .prepare(
      `SELECT room.game_id, room.code, room.created_by,
              project.id AS project_id, project.program_id,
              project.game_id AS project_game_id, project.name AS project_name,
              program.name AS program_name
       FROM game_rooms AS room
       LEFT JOIN game_project AS selected ON selected.game_id = room.game_id
       LEFT JOIN feasibility_projects AS project ON project.id = selected.project_id
       LEFT JOIN feasibility_programs AS program ON program.id = project.program_id
       WHERE room.code = ? AND room.closed_at IS NULL
       ORDER BY project.id
       LIMIT 1`,
    )
    .bind(code)
    .first();
}

async function getRoom(db, code) {
  return db
    .prepare(
      "SELECT game_id, game_name, created_by FROM game_rooms WHERE code = ? AND closed_at IS NULL",
    )
    .bind(code)
    .first(); // null if not found
}

export async function joinRoom(c) {
  const { inviteCode, displayName } = await c.req.json();
  const code = c.req.param("code");

  const room = await getRoom(c.env.DB, code);
  if (!room) return c.json({ error: "Room not found" }, 404);

  const student = await c.env.DB.prepare(
    `SELECT s.id FROM game_team_students s
     JOIN game_team t ON t.id = s.game_team_id
     WHERE s.invite_code = ? AND t.game_id = ?`, // check the real column name
  )
    .bind(inviteCode, room.game_id)
    .first();

  if (!student) return c.json({ error: "Invalid invite" }, 403);

  const token = crypto.randomUUID();
  await c.env.DB.prepare(
    "UPDATE game_team_students SET session_token = ?, joined_at = ?, display_name = ? WHERE id = ?",
  )
    .bind(token, new Date().toISOString(), displayName, student.id)
    .run();

  return c.json({ sessionToken: token, wsPath: `/ws/rooms/${code}` });
}

export async function connectCode(c) {
  if (c.req.header("Upgrade") !== "websocket")
    return c.text("Expected WebSocket", 426);

  const room = await getRoom(c.env.DB, c.req.param("code"));
  if (!room) return c.json({ error: "Room not found" }, 404);

  const identity = await authenticate(c, room);
  if (!identity) return c.text("Unauthorized", 401);

  const stub = c.env.GAME_ROOM.get(
    c.env.GAME_ROOM.idFromName(`games-${room.game_id}`),
  );

  const headers = new Headers(c.req.raw.headers);
  headers.set("X-Role", identity.role);
  headers.set("X-User-Id", String(identity.id));
  headers.set("X-Name", identity.name);
  headers.set("X-Game-Id", String(room.game_id));

  return stub.fetch(new Request(c.req.raw, { headers }));
}

async function authenticate(c, room) {
  const token = c.req.query("token");
  if (!token) return null;

  // 1. Student: session token issued by joinRoom
  const student = await c.env.DB.prepare(
    `SELECT s.id, s.display_name FROM game_team_students s
     JOIN game_team t ON t.id = s.game_team_id
     WHERE s.session_token = ? AND t.game_id = ?`,
  )
    .bind(token, room.game_id)
    .first();

  if (student)
    return { role: "student", id: student.id, name: student.display_name };

  // 2. Teacher: reuse the same verification your auth middleware does
  const userId = c.get("userId");
  if (userId && Number(userId) === room.created_by)
    return { role: "teacher", id: userId, name: "Teacher" };

  return null;
}
