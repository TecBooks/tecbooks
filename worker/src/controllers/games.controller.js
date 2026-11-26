import authenticate, { resolveGameIdentity } from "../utils/authenticate";
import { createGameSessionToken } from "../utils/game-session-token";
import {
  createGameRoom,
  findActiveGameRoom,
  validateProjects,
} from "../services/game-room.service";

const ALPHABET =
  "ABCDFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890";
function makeCode(len = 6) {
  return [...crypto.getRandomValues(new Uint8Array(len))]
    .map((b) => ALPHABET[b % ALPHABET.length])
    .join("");
}

export async function createGame(c) {
  const userId = c.get("userId");
  const { name, numTeams, timePerRound, selectedTags } = await c.req.json();

  // Validación básica
  if (
    !name ||
    !Number.isInteger(numTeams) ||
    numTeams < 2 ||
    !Number.isInteger(timePerRound) ||
    timePerRound < 10 ||
    !Array.isArray(selectedTags) ||
    selectedTags.length !== 1
  ) {
    return c.json({ error: "Invalid payload" }, 400);
  }

  // Solo enteros, sin duplicados
  const projectIds = [...new Set(selectedTags.map(Number))];
  if (!projectIds.every(Number.isInteger)) {
    return c.json({ error: "Invalid project ids" }, 400);
  }

  // Verificar que todos existan
  const placeholders = projectIds.map(() => "?").join(",");
  const { results } = await validateProjects(
    c,
    placeholders,
    projectIds,
    userId,
  );

  if (results[0].n !== projectIds.length) {
    return c.json({ error: "Some projects do not exist" }, 400);
  }

  // Reintentar si hay colisión en el código
  for (let i = 0; i < 5; i++) {
    const code = makeCode();
    try {
      const sessionToken = await createGameSessionToken(c.env.JWT_SECRET, {
        code,
        role: "teacher",
        subject: userId,
        name: "Teacher",
      });
      await createGameRoom(
        c,
        { code, name, userId, numTeams, timePerRound },
        projectIds,
      );

      return c.json({ code, sessionToken }, 201);
    } catch (error) {
      if (String(error).includes("UNIQUE")) {
        console.warn(`Code collision (${code}), retrying`);
        continue;
      }
      console.error("createGame failed:", error);
      return c.json({ error: "Could not create game" }, 500);
    }
  }

  return c.json({ error: "Could not allocate code" }, 500);
}

export async function getGameRoom(c) {
  const code = c.req.param("code");
  const room = await findActiveGameRoom(c.env.DB, code);

  if (!room) {
    return c.json(
      {
        error:
          "Sorry, the game room you are looking for does not exists or has been cloesd",
      },
      404,
    );
  }

  return c.json({
    code: room.code,
    projectSelection: toProjectSelection(room),
  });
}

export async function joinGameRoom(c) {
  const code = c.req.param("code");
  const room = await findActiveGameRoom(c.env.DB, code);

  if (!room) {
    return c.json(
      {
        error:
          "Sorry, the game room you are looking for does not exists or has been cloesd",
      },
      404,
    );
  }

  const body = await c.req.json();
  const hasDisplayName = body?.displayName !== undefined;
  const displayName =
    typeof body?.displayName === "string" ? body.displayName.trim() : null;
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    (body.sessionToken != null && typeof body.sessionToken !== "string") ||
    (hasDisplayName &&
      (typeof body.displayName !== "string" ||
        displayName.length === 0 ||
        displayName.length > 60))
  ) {
    return c.json({ error: "Invalid session or display name" }, 400);
  }

  const previousToken = body.sessionToken;
  const previousIdentity = await resolveGameIdentity(c, previousToken, room);
  if (previousIdentity) {
    if (
      previousIdentity.role === "student" &&
      displayName &&
      previousIdentity.name !== displayName
    ) {
      const sessionToken = await createGameSessionToken(c.env.JWT_SECRET, {
        code,
        role: "student",
        subject: previousIdentity.id,
        name: displayName,
      });
      return c.json({ code, sessionToken });
    }
    return c.json({ code, sessionToken: previousToken });
  }

  const sessionToken = await createGameSessionToken(c.env.JWT_SECRET, {
    code,
    role: "student",
    subject: crypto.randomUUID(),
    name: displayName ?? "Player",
  });

  return c.json({ code, sessionToken }, 201);
}

export async function joinRoom(c) {
  const { inviteCode, displayName } = await c.req.json();

  const [code, room] = await getRoom(c);

  const student = await c.env.DB.prepare(
    `
      SELECT s.id FROM game_team_students s
      JOIN game_team t ON t.id = s.game_team_id
      WHERE s.inite_code = ? AND t.game_id = ?
    `,
  )
    .bind(inviteCode, room.game_id)
    .first();

  if (!student) return c.json({ error: "Invalid invite" }, 403);

  const token = crypto.randomUUID();
  await c.env.DB.prepare(
    "UPDATE game_team_students SET session_token = ?, joined_at = ?, display_name =? ? WHERE id = ?",
  )
    .bind(token, new Date().toISOString(), displayName, student.id)
    .rund();

  return c.json({ sessionToken: token, wsPath: `/ws/rooms/${code}` });
}

export async function connectCode(c) {
  if (c.req.header("Upgrade") !== "websocket")
    return c.text("Expected WebSocket", 426);

  const room = await findActiveGameRoom(c.env.DB, c.req.param("code"));
  if (!room) {
    return c.json(
      {
        error:
          "Sorry, the game room you are looking for does not exists or has been cloesd",
      },
      404,
    );
  }

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
  headers.set("X-Num-Teams", String(room.n_teams));
  headers.set("X-Program-Id", String(room.program_id ?? ""));
  headers.set("X-Project-Id", String(room.project_id ?? ""));
  headers.set("X-Project-Game-Id", String(room.project_game_id ?? ""));
  headers.set("X-Program-Name", encodeURIComponent(room.program_name ?? ""));
  headers.set("X-Project-Name", encodeURIComponent(room.project_name ?? ""));

  return stub.fetch(new Request(c.req.raw, { headers }));
}

function toProjectSelection(room) {
  if (!room.project_id || !room.program_id || !room.project_game_id) return null;
  return {
    programId: room.program_id,
    programName: room.program_name,
    projectId: room.project_id,
    projectName: room.project_name,
    gameId: room.project_game_id,
  };
}

async function getRoom(c) {
  const code = c.req.param("code");
  const room = await c.env.DB.prepare(
    "SELECT game_id FROM game_rooms WHERE code = ? AND closed_at IS NULL",
  )
    .bind(code)
    .first();
  if (!room) return c.json({ error: "Room not found" }, 404);

  return [code, room];
}
