import { login, register, forgotPassword, resetPassword } from '../services/auth.service.js';

export async function loginUseCase(env, { email, password }) {
  try {
    return await login(env, email, password);
  } catch (error) {
    if (!error.status) {
      console.error('[auth.usecase] loginUseCase failed:', error);
    }
    throw error;
  }
}

export async function registerUseCase(env, { email, password, first_name, last_name }) {
  try {
    return await register(env, { email, password, first_name, last_name });
  } catch (error) {
    if (!error.status) {
      console.error('[auth.usecase] registerUseCase failed:', error);
    }
    throw error;
  }
}

export async function forgotPasswordUseCase(env, { email }) {
  try {
    return await forgotPassword(env, email);
  } catch (error) {
    if (!error.status) {
      console.error('[auth.usecase] forgotPasswordUseCase failed:', error);
    }
    throw error;
  }
}

export async function resetPasswordUseCase(env, { token, password }) {
  try {
    return await resetPassword(env, token, password);
  } catch (error) {
    if (!error.status) {
      console.error('[auth.usecase] resetPasswordUseCase failed:', error);
    }
    throw error;
  }
}
