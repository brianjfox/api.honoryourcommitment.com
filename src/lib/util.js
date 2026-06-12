import crypto from 'node:crypto'
import { config } from '../config.js'

// Salted hash of an IP address — lets us detect abuse without storing the
// raw IP (which is personal data under the GDPR).
export function hashIp(ip) {
  if (!ip) return null
  return crypto
    .createHash('sha256')
    .update(config.ipHashSalt + '|' + ip)
    .digest('hex')
}

// Opaque, URL-safe confirmation token for the double opt-in flow.
export function newToken() {
  return crypto.randomBytes(32).toString('base64url')
}

// Returns the client IP, honoring the X-Forwarded-For set by the Nginx proxy.
export function clientIp(req) {
  return req.ip
}

// Honeypot: the form ships a hidden field that humans never fill. If it has
// any value, treat the request as a bot. We respond 200 (so the bot thinks
// it succeeded) but persist nothing.
export function isHoneypotTripped(body) {
  return Boolean(body && typeof body.botcheck === 'string' && body.botcheck.trim())
}
