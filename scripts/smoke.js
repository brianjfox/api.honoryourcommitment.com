// End-to-end smoke test using Fastify's inject (no real network needed).
// Requires a migrated database (run `npm run migrate` first) and
// DISABLE_TURNSTILE=true. Exits non-zero on any failure.
import assert from 'node:assert'
import { buildServer } from '../src/server.js'
import { query, closePool } from '../src/lib/db.js'

const app = await buildServer()

function check(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  console.log(`  ✓ ${name}`)
}

try {
  // Clean slate for a deterministic run.
  await query('DELETE FROM signatures WHERE email LIKE $1', ['smoke+%'])

  // Health
  let res = await app.inject({ method: 'GET', url: '/api/health' })
  check('health 200', res.statusCode === 200)

  // Reject missing consent (consent_processing must be true)
  res = await app.inject({
    method: 'POST',
    url: '/api/signatures',
    payload: {
      firstName: 'A',
      lastName: 'B',
      email: 'smoke+noconsent@example.com',
      country: 'China',
      consentProcessing: false,
    },
  })
  check('missing consent rejected (400)', res.statusCode === 400)

  // Reject bad email
  res = await app.inject({
    method: 'POST',
    url: '/api/signatures',
    payload: {
      firstName: 'A',
      lastName: 'B',
      email: 'not-an-email',
      country: 'China',
      consentProcessing: true,
    },
  })
  check('invalid email rejected (400)', res.statusCode === 400)

  // Honeypot tripped → 200 but nothing stored
  res = await app.inject({
    method: 'POST',
    url: '/api/signatures',
    payload: {
      firstName: 'Bot',
      lastName: 'Net',
      email: 'smoke+bot@example.com',
      country: 'China',
      consentProcessing: true,
      botcheck: 'i am a bot',
    },
  })
  check('honeypot accepted silently (200)', res.statusCode === 200)
  const botCount = await query('SELECT 1 FROM signatures WHERE email=$1', [
    'smoke+bot@example.com',
  ])
  check('honeypot stored nothing', botCount.rowCount === 0)

  // Valid submission → 201 pending confirmation
  res = await app.inject({
    method: 'POST',
    url: '/api/signatures',
    payload: {
      firstName: 'Real',
      lastName: 'Person',
      email: 'smoke+real@example.com',
      country: 'Brazil',
      consentProcessing: true,
      consentPublic: true,
      locale: 'pt',
    },
  })
  check('valid signature accepted (201)', res.statusCode === 201)
  check(
    'status pending_confirmation',
    JSON.parse(res.payload).status === 'pending_confirmation'
  )

  // Not counted until confirmed
  res = await app.inject({ method: 'GET', url: '/api/stats' })
  let stats = JSON.parse(res.payload)
  const before = stats.signatures

  // Fetch the token (email is disabled in dev) and confirm
  const row = await query(
    'SELECT confirm_token FROM signatures WHERE email=$1',
    ['smoke+real@example.com']
  )
  const token = row.rows[0].confirm_token
  check('confirm token issued', Boolean(token))

  res = await app.inject({
    method: 'GET',
    url: `/api/confirm?type=signature&token=${encodeURIComponent(token)}`,
  })
  check('confirm redirects (302)', res.statusCode === 302)
  check(
    'confirm redirect carries status',
    /status=confirmed/.test(res.headers.location)
  )

  // Stats must reflect the confirmation (bust the 60s cache by waiting—
  // instead we assert the DB directly to avoid the cache window).
  const confirmed = await query(
    'SELECT confirmed_at FROM signatures WHERE email=$1',
    ['smoke+real@example.com']
  )
  check('record marked confirmed', confirmed.rows[0].confirmed_at !== null)

  // Re-using a token reports already_confirmed (not the same as invalid)
  res = await app.inject({
    method: 'GET',
    url: `/api/confirm?type=signature&token=${encodeURIComponent(token)}`,
  })
  check(
    'reused token → already_confirmed',
    /status=already_confirmed/.test(res.headers.location)
  )

  // A bogus token reports invalid
  res = await app.inject({
    method: 'GET',
    url: `/api/confirm?type=signature&token=nope-this-token-does-not-exist`,
  })
  check('bogus token → invalid', /status=invalid\b/.test(res.headers.location))

  console.log('\nAll smoke checks passed.')
} catch (err) {
  console.error('\n' + err.message)
  process.exitCode = 1
} finally {
  await query('DELETE FROM signatures WHERE email LIKE $1', ['smoke+%'])
  await app.close()
  await closePool()
}
