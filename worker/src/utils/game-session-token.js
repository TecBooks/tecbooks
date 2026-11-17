import { sign, verify } from "hono/jwt";

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function createGameSessionToken(
  secret,
  { code, role, subject, name },
) {
  const issuedAt = Math.floor(Date.now() / 1000);

  return sign(
    {
      sub: String(subject),
      code,
      role,
      name,
      iat: issuedAt,
      exp: issuedAt + SESSION_TTL_SECONDS,
    },
    secret,
    "HS256",
  );
}

export async function verifyGameSessionToken(secret, token, room) {
  try {
    const payload = await verify(token, secret, "HS256");
    if (payload.code !== room.code) return null;

    if (
      payload.role === "teacher" &&
      Number(payload.sub) === Number(room.created_by)
    ) {
      return {
        role: "teacher",
        id: payload.sub,
        name: payload.name ?? "Teacher",
      };
    }

    if (
      payload.role === "student" &&
      typeof payload.sub === "string" &&
      payload.sub.length > 0
    ) {
      return {
        role: "student",
        id: payload.sub,
        name: payload.name ?? "Player",
      };
    }
  } catch {
    return null;
  }

  return null;
}
