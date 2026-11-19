import { findUserByEmail, findUserById, createUser, updateUserPassword, findRoleIdByName, findSchoolIdBySlug } from '../models/users.model.js';
import { toSafeUser } from '../mappers/user.mapper.js';
import { hashPassword, verifyPassword } from './password.service.js';
import { createClerkUserAccount, updateClerkUserPassword } from './clerk-auth.service.js';
import { buildAuthSession } from './session.service.js';
import { createPasswordResetToken, verifyPasswordResetToken } from './password-reset.service.js';
import { sendPasswordResetEmail } from './email.service.js';

const BLOCKED_STATUSES = ['banned', 'deactivated', 'locked'];
const DEFAULT_SIGNUP_ROLE = 'student';
const DEFAULT_SIGNUP_SCHOOL_SLUG = 'general';

export async function login(env, email, password) {
  try {
    const user = await findUserByEmail(env.DB, email);
    if (!user) {
      const error = new Error('form_identifier_not_found');
      error.status = 401;
      throw error;
    }

    if (BLOCKED_STATUSES.includes(user.status)) {
      const error = new Error('user_banned');
      error.status = 403;
      throw error;
    }

    const passwordMatches = await verifyPassword(password, user.hashed_password);
    if (!passwordMatches) {
      const error = new Error('form_password_incorrect');
      error.status = 401;
      throw error;
    }

    const session = await buildAuthSession(env, user);
    return { safeUser: toSafeUser(user), ...session };
  } catch (error) {
    if (!error.status) {
      console.error('[auth.service] login failed:', error);
    }
    throw error;
  }
}

export async function register(env, { email, password, first_name: firstName, last_name: lastName }) {
  try {
    const existingUser = await findUserByEmail(env.DB, email);
    if (existingUser) {
      const error = new Error('email_already_registered');
      error.status = 409;
      throw error;
    }

    const roleId = await findRoleIdByName(env.DB, DEFAULT_SIGNUP_ROLE);
    const schoolId = await findSchoolIdBySlug(env.DB, DEFAULT_SIGNUP_SCHOOL_SLUG);
    if (!roleId || !schoolId) {
      const error = new Error('signup_not_configured');
      error.status = 500;
      throw error;
    }

    const clerkUser = await createClerkUserAccount(env, { email, password, firstName, lastName });
    const hashedPassword = await hashPassword(password);

    const userId = await createUser(env.DB, {
      school_id: schoolId,
      email,
      first_name: firstName,
      last_name: lastName,
      role_id: roleId,
      hashed_password: hashedPassword,
      status: 'active',
      clerk_user_id: clerkUser.id,
    });

    const newUser = {
      id: userId,
      email,
      first_name: firstName,
      last_name: lastName,
      role_id: roleId,
      school_id: schoolId,
      clerk_user_id: clerkUser.id,
    };

    const session = await buildAuthSession(env, newUser);
    return { safeUser: toSafeUser(newUser), ...session };
  } catch (error) {
    if (!error.status) {
      console.error('[auth.service] register failed:', error);
    }
    throw error;
  }
}

export async function forgotPassword(env, email) {
  try {
    const user = await findUserByEmail(env.DB, email);
    // No revela si el email existe - misma respuesta en ambos casos.
    if (!user || BLOCKED_STATUSES.includes(user.status)) return;

    const token = await createPasswordResetToken(env, user.id);
    const resetLink = `${env.FRONTEND_URL}/reset-password?token=${token}`;
    await sendPasswordResetEmail(env, { to: user.email, resetLink });
  } catch (error) {
    console.error('[auth.service] forgotPassword failed:', error);
    throw error;
  }
}

export async function resetPassword(env, token, newPassword) {
  try {
    const userId = await verifyPasswordResetToken(env, token);

    const user = await findUserById(env.DB, userId);
    if (!user || BLOCKED_STATUSES.includes(user.status)) {
      const error = new Error('invalid_reset_token');
      error.status = 400;
      throw error;
    }

    const hashedPassword = await hashPassword(newPassword);
    await updateUserPassword(env.DB, user.id, hashedPassword);
    await updateClerkUserPassword(env, user.clerk_user_id, newPassword);
  } catch (error) {
    if (!error.status) {
      console.error('[auth.service] resetPassword failed:', error);
    }
    throw error;
  }
}
