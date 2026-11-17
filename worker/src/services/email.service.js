const RESEND_API_URL = 'https://api.resend.com/emails';

export async function sendPasswordResetEmail(env, { to, resetLink }) {
  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL,
        to,
        subject: 'Reset your TECBooks password',
        html: `
          <p>Someone requested a password reset for your TECBooks account.</p>
          <p><a href="${resetLink}">Click here to set a new password</a>. This link expires in 15 minutes.</p>
          <p>If you didn't request this, you can ignore this email.</p>
        `,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error('[email.service] Resend request failed:', response.status, body);
      const error = new Error('email_send_failed');
      error.status = 502;
      throw error;
    }
  } catch (error) {
    if (!error.status) {
      console.error('[email.service] sendPasswordResetEmail failed:', error);
      const wrapped = new Error('email_send_failed');
      wrapped.status = 502;
      throw wrapped;
    }
    throw error;
  }
}
