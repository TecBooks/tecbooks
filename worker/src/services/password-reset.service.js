import { sign, verify } from 'hono/jwt';

const RESET_TOKEN_TTL_SECONDS = 60 * 15; // 15 min
const RESET_TOKEN_PURPOSE = 'password_reset';

export async function createPasswordResetToken(env, userId) {
  try {
    return await sign(
      {
        sub: String(userId),
        purpose: RESET_TOKEN_PURPOSE,
        exp: Math.floor(Date.now() / 1000) + RESET_TOKEN_TTL_SECONDS,
      },
      env.JWT_SECRET,
      'HS256'
    );
  } catch (error) {
    console.error('[password-reset.service] createPasswordResetToken failed:', error);
    throw error;
  }
}

/** @returns {number} userId encoded in the token */
export async function verifyPasswordResetToken(env, token) {
  try {
    const payload = await verify(token, env.JWT_SECRET, 'HS256');
    if (payload.purpose !== RESET_TOKEN_PURPOSE) {
      const error = new Error('invalid_reset_token');
      error.status = 400;
      throw error;
    }
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId < 1) {
      const error = new Error('invalid_reset_token');
      error.status = 400;
      throw error;
    }
    return userId;
  } catch (error) {
    if (error.status) throw error;
    const invalidError = new Error('invalid_reset_token');
    invalidError.status = 400;
    throw invalidError;
  }
}
