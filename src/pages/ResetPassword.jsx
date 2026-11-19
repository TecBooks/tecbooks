import React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, useSearchParams, Link as RouterLink } from 'react-router-dom'
import { Box, Button, TextField, Typography, Alert, Link as MuiLink } from '@mui/material'
import GenericHeader from '@/components/global/GenericHeader'
import { resetPasswordRequest } from '@/sims/project-feasibility/api/auth.api'
import './Login.css'

const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters long'),
})

const RESET_ERROR_MESSAGES = {
  invalid_reset_token: 'This reset link is invalid or has expired. Please request a new one.',
}

function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const navigate = useNavigate()
  const [done, setDone] = React.useState(false)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(resetPasswordSchema) })

  const onSubmit = async ({ password }) => {
    try {
      await resetPasswordRequest(token, password)
      setDone(true)
      setTimeout(() => navigate('/login', { replace: true }), 2000)
    } catch (err) {
      const code = err.response?.data?.error
      setError('root', { message: RESET_ERROR_MESSAGES[code] || 'Unable to reset password, please try again' })
    }
  }

  return (
    <>
      <GenericHeader pageName="Reset Password" />
      <Box className="auth-wrapper">
        <Box className="auth-container" sx={{ minHeight: 'auto', width: { xs: '95%', sm: 480 } }}>
          <Box className="auth-form-container" sx={{ position: 'static', width: '100%' }}>
            {!token ? (
              <Box className="auth-form-inner">
                <Typography variant="h5" sx={{ fontWeight: 700, color: '#073a5a' }}>
                  Invalid link
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  This reset link is missing its token. Request a new one from the sign in page.
                </Typography>
                <MuiLink component={RouterLink} to="/login" underline="hover" sx={{ mt: 1 }}>
                  Back to Sign In
                </MuiLink>
              </Box>
            ) : done ? (
              <Box className="auth-form-inner">
                <Typography variant="h5" sx={{ fontWeight: 700, color: '#073a5a' }}>
                  Password updated
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Redirecting you to sign in...
                </Typography>
              </Box>
            ) : (
              <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate className="auth-form-inner">
                <Typography variant="h5" sx={{ fontWeight: 700, color: '#073a5a' }}>
                  Set a new password
                </Typography>

                {errors.root && <Alert severity="error">{errors.root.message}</Alert>}

                <TextField
                  label="New Password"
                  type="password"
                  size="small"
                  {...register('password')}
                  error={!!errors.password}
                  helperText={errors.password?.message || 'At least 8 characters'}
                />

                <Button type="submit" variant="contained" disabled={isSubmitting} sx={{ bgcolor: '#073a5a', borderRadius: 999, py: 1, mt: 1 }}>
                  Reset Password
                </Button>
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </>
  )
}

export default ResetPassword
