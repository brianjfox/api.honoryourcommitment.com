import { config } from '../config.js'

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/* Verify a Cloudflare Turnstile token submitted with a form. Returns
   { ok: boolean, reason?: string }. In local dev, verification can be
   disabled via DISABLE_TURNSTILE. */
export async function verifyTurnstile(token, remoteIp) {
  if (config.turnstile.disabled) return { ok: true }

  if (!config.turnstile.secret) {
    return { ok: false, reason: 'turnstile-not-configured' }
  }
  if (!token) return { ok: false, reason: 'missing-token' }

  const body = new URLSearchParams()
  body.append('secret', config.turnstile.secret)
  body.append('response', token)
  if (remoteIp) body.append('remoteip', remoteIp)

  try {
    const res = await fetch(VERIFY_URL, { method: 'POST', body })
    const data = await res.json()
    if (data.success) return { ok: true }
    return { ok: false, reason: (data['error-codes'] || []).join(',') || 'failed' }
  } catch (err) {
    return { ok: false, reason: 'verify-request-failed' }
  }
}
