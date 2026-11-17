import workerApi from '@/utils/worker.util'

export async function loginRequest(email, password) {
  const { data } = await workerApi.post('/api/auth/login', { email, password })
  return data
}

export async function registerRequest({
  email,
  password,
  first_name,
  last_name,
}) {
  const { data } = await workerApi.post('/api/auth/register', {
    email,
    password,
    first_name,
    last_name,
  })
  return data
}

export async function logoutRequest() {
  const { data } = await workerApi.post('/api/auth/logout')
  return data
}

export async function forgotPasswordRequest(email) {
  const { data } = await workerApi.post('/api/auth/forgot-password', { email })
  return data
}

export async function resetPasswordRequest(token, password) {
  const { data } = await workerApi.post('/api/auth/reset-password', { token, password })
  return data
}
