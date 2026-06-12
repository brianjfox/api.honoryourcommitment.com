import 'dotenv/config'

// Centralized, validated configuration. Fail fast in production if a
// required secret is missing.
function required(name, devFallback) {
  const val = process.env[name]
  if (val === undefined || val === '') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing required environment variable: ${name}`)
    }
    return devFallback
  }
  return val
}

const bool = (v, def = false) =>
  v === undefined ? def : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase())

const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(
  /\/$/,
  ''
)

// Allowed CORS origins: the configured frontend URL plus its apex/www sibling
// (the site canonicalizes to the apex, but allow both so a www-vs-apex mismatch
// can't block the browser). Add more with CORS_EXTRA_ORIGINS (comma-separated).
function corsOrigins(url) {
  const out = new Set([url])
  try {
    const u = new URL(url)
    const port = u.port ? `:${u.port}` : ''
    const sibling = u.hostname.startsWith('www.')
      ? u.hostname.slice(4)
      : `www.${u.hostname}`
    out.add(`${u.protocol}//${sibling}${port}`)
  } catch {
    /* non-URL value (e.g. dev default) — leave as-is */
  }
  for (const o of (process.env.CORS_EXTRA_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    out.add(o)
  }
  return [...out]
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',

  host: process.env.HOST || '127.0.0.1',
  port: parseInt(process.env.PORT || '3000', 10),

  databaseUrl: required('DATABASE_URL', 'postgres://phyc:phyc@localhost:5432/phyc'),

  frontendUrl: FRONTEND_URL,
  frontendOrigins: corsOrigins(FRONTEND_URL),
  apiPublicUrl: (process.env.API_PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, ''),

  privacyPolicyVersion: process.env.PRIVACY_POLICY_VERSION || 'unversioned',
  ipHashSalt: required('IP_HASH_SALT', 'dev-insecure-salt'),

  turnstile: {
    secret: process.env.TURNSTILE_SECRET || '',
    disabled: bool(process.env.DISABLE_TURNSTILE, false),
  },

  email: {
    disabled: bool(process.env.DISABLE_EMAIL, false),
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from:
      process.env.EMAIL_FROM ||
      'Honor Your Commitment <no-reply@honoryourcommitment.com>',
  },

  rateLimit: {
    globalMax: parseInt(process.env.RATE_LIMIT_GLOBAL_MAX || '120', 10),
    globalWindow: process.env.RATE_LIMIT_GLOBAL_WINDOW || '1 minute',
    submitMax: parseInt(process.env.RATE_LIMIT_SUBMIT_MAX || '5', 10),
    submitWindow: process.env.RATE_LIMIT_SUBMIT_WINDOW || '10 minutes',
  },

  // Daily news curation (scripts/fetch-news.js, run by a systemd timer).
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-opus-4-8',
  },
  news: {
    count: parseInt(process.env.NEWS_COUNT || '4', 10),
    lookbackDays: parseInt(process.env.NEWS_LOOKBACK_DAYS || '21', 10),
  },
}

// Helpful warnings when running with insecure defaults outside production.
export function warnInsecureDefaults(log) {
  if (config.isProd) return
  if (config.turnstile.disabled)
    log.warn('Turnstile verification is DISABLED (dev only).')
  if (config.email.disabled)
    log.warn('Email sending is DISABLED — confirmation links will be logged.')
  if (config.ipHashSalt === 'dev-insecure-salt')
    log.warn('Using insecure default IP_HASH_SALT (dev only).')
}
