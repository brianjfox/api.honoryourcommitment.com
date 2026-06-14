import { query } from '../lib/db.js'
import { config } from '../config.js'
import { confirmSchema } from '../schemas.js'

const TABLE = { signature: 'signatures', case: 'cases', claimant: 'claimants' }

/* Double opt-in confirmation. The link in the confirmation email points here.
   We mark the record confirmed and redirect the visitor back to the frontend
   with a status the banner can speak to:
     - confirmed         : just confirmed now
     - already_confirmed : this link was already used (record is confirmed)
     - invalid           : no record matches this token
   The token is kept after confirmation so a re-click can be told apart from a
   bogus link. (`type` is enum-validated, so the table name is safe to inline.)
   GDPR: confirmation is the affirmative step that makes consent demonstrable. */
export default async function confirmRoute(fastify) {
  fastify.get('/api/confirm', { schema: confirmSchema }, async (req, reply) => {
    const { type, token } = req.query
    const table = TABLE[type]

    const found = await query(
      `SELECT confirmed_at FROM ${table} WHERE confirm_token = $1`,
      [token]
    )

    let status
    if (found.rowCount === 0) {
      status = 'invalid'
    } else if (found.rows[0].confirmed_at) {
      status = 'already_confirmed'
    } else {
      await query(
        `UPDATE ${table} SET confirmed_at = now(), updated_at = now()
         WHERE confirm_token = $1 AND confirmed_at IS NULL`,
        [token]
      )
      status = 'confirmed'
    }

    return reply.redirect(
      `${config.frontendUrl}/?confirmed=${encodeURIComponent(
        type
      )}&status=${status}`
    )
  })
}
