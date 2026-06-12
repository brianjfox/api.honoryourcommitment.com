import { verifyTurnstile } from './turnstile.js'
import { sendConfirmationEmail } from './email.js'
import { hashIp, newToken, clientIp, isHoneypotTripped } from './util.js'

/* Shared pipeline for all three public submission endpoints:
   1. Honeypot — silently accept and drop obvious bots.
   2. Turnstile — verify the human-verification token.
   3. doInsert — upsert the record with a fresh confirmation token.
        Returns the pg result; rowCount 0 means the email already exists
        AND is already confirmed (so we skip re-sending).
   4. Double opt-in — email the confirmation link. The record only counts
      toward public stats once confirmed.

   doInsert receives { token, ipHash } and must perform an upsert that
   RETURNS a row only when a confirmation email should be (re)sent. */
export async function processSubmission(req, reply, { type, email, locale, doInsert }) {
  if (isHoneypotTripped(req.body)) {
    // Pretend success so bots don't learn they were caught.
    return reply.code(200).send({ ok: true, status: 'received' })
  }

  const ts = await verifyTurnstile(req.body.turnstileToken, clientIp(req))
  if (!ts.ok) {
    return reply
      .code(400)
      .send({ ok: false, error: 'captcha_failed', reason: ts.reason })
  }

  const token = newToken()
  const ipHash = hashIp(clientIp(req))
  const result = await doInsert({ token, ipHash })

  if (!result || result.rowCount === 0) {
    // Email exists and is already confirmed — nothing more to do.
    return reply.code(200).send({ ok: true, status: 'already_confirmed' })
  }

  await sendConfirmationEmail({ to: email, type, token, locale: locale || 'en' }, req.log)
  return reply.code(201).send({ ok: true, status: 'pending_confirmation' })
}
