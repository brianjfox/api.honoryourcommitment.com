import crypto from 'node:crypto'

/* Stateless, signed unsubscribe tokens. The admin server builds links with
   makeUnsubToken() and the API verifies them here — no per-send DB row needed.
   Format: base64url(email) + "." + base64url(HMAC-SHA256(base64url(email))).
   Both services share the same secret (config.unsubscribeSecret). */

export function makeUnsubToken(email, secret) {
  const e = Buffer.from(String(email).trim().toLowerCase(), 'utf8').toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(e).digest('base64url')
  return `${e}.${sig}`
}

export function verifyUnsubToken(token, secret) {
  const [e, sig] = String(token || '').split('.')
  if (!e || !sig) return null
  const expected = crypto.createHmac('sha256', secret).update(e).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    return Buffer.from(e, 'base64url').toString('utf8').toLowerCase()
  } catch {
    return null
  }
}
