import { loginUseCase, registerUseCase, forgotPasswordUseCase, resetPasswordUseCase } from '../usecases/auth.usecase.js';
import { loginRequestSchema, registerRequestSchema, forgotPasswordRequestSchema, resetPasswordRequestSchema } from '../requests/auth.request.js';
import { setSessionCookie, clearSessionCookie } from '../utils/session-cookie.util.js';

export async function loginController(context) {
  try {
    const requestBody = await context.req.json();
    const validationResult = loginRequestSchema.safeParse(requestBody);
    if (!validationResult.success) {
      return context.json({ error: 'invalid_body', details: validationResult.error.flatten() }, 400);
    }

    const { safeUser, token, clerkTicket } = await loginUseCase(context.env, validationResult.data);

    setSessionCookie(context, token);

    return context.json({ user: safeUser, token, clerkTicket }, 200);
  } catch (error) {
    if (!error.status) {
      console.error('[auth.controller] loginController failed:', error);
    }
    throw error;
  }
}

export async function registerController(context) {
  try {
    const requestBody = await context.req.json();
    const validationResult = registerRequestSchema.safeParse(requestBody);
    if (!validationResult.success) {
      return context.json({ error: 'invalid_body', details: validationResult.error.flatten() }, 400);
    }

    const { safeUser, token, clerkTicket } = await registerUseCase(context.env, validationResult.data);

    setSessionCookie(context, token);

    return context.json({ user: safeUser, token, clerkTicket }, 201);
  } catch (error) {
    if (!error.status) {
      console.error('[auth.controller] registerController failed:', error);
    }
    throw error;
  }
}

export async function forgotPasswordController(context) {
  try {
    const requestBody = await context.req.json();
    const validationResult = forgotPasswordRequestSchema.safeParse(requestBody);
    if (!validationResult.success) {
      return context.json({ error: 'invalid_body', details: validationResult.error.flatten() }, 400);
    }

    await forgotPasswordUseCase(context.env, validationResult.data);

    // Misma respuesta exista o no el email - no se revela si una cuenta existe.
    return context.json({ ok: true }, 200);
  } catch (error) {
    if (!error.status) {
      console.error('[auth.controller] forgotPasswordController failed:', error);
    }
    throw error;
  }
}

export async function resetPasswordController(context) {
  try {
    const requestBody = await context.req.json();
    const validationResult = resetPasswordRequestSchema.safeParse(requestBody);
    if (!validationResult.success) {
      return context.json({ error: 'invalid_body', details: validationResult.error.flatten() }, 400);
    }

    await resetPasswordUseCase(context.env, validationResult.data);

    return context.json({ ok: true }, 200);
  } catch (error) {
    if (!error.status) {
      console.error('[auth.controller] resetPasswordController failed:', error);
    }
    throw error;
  }
}

export async function logoutController(context) {
  try {
    clearSessionCookie(context);
    return context.json({ ok: true }, 200);
  } catch (error) {
    if (!error.status) {
      console.error('[auth.controller] logoutController failed:', error);
    }
    throw error;
  }
}
