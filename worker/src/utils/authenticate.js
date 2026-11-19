import { verifyGameSessionToken } from "./game-session-token";

export async function resolveGameIdentity(c, token, room) {
  if (!token) return null;

  const student = await c.env.DB.prepare(
    `
      SELECT s.id, s.display_name FROM game_team_students s
      JOIN game_teams t ON t.id = s.game_team_id
      WHERE s.session_token = ? AND t.game_id = ?
    `,
  )
    .bind(token, room.game_id)
    .first();
  if (student)
    return { role: "student", id: student.id, name: student.display_name };

  return verifyGameSessionToken(c.env.JWT_SECRET, token, room);
}

async function authenticate(c, room) {
  return resolveGameIdentity(c, c.req.query("token"), room);
}

export default authenticate;
