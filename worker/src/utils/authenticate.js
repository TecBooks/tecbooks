import { verifyGameSessionToken } from "./game-session-token";

// Game-room identity comes only from the signed session JWT issued by
// POST /api/games/rooms/:code/join (students) or by room creation (teacher).
// No D1 lookup here: this runs on every WebSocket (re)connect, so it must stay
// free of reads. (The old `game_team_students.session_token` lookup was an
// unindexed full scan that never matched game rooms — that table belongs to
// the Novus `game_teams` schema, not to `game_rooms`.)
export async function resolveGameIdentity(c, token, room) {
  if (!token) return null;
  return verifyGameSessionToken(c.env.JWT_SECRET, token, room);
}

async function authenticate(c, room) {
  return resolveGameIdentity(c, c.req.query("token"), room);
}

export default authenticate;
