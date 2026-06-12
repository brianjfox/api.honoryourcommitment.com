import { query } from '../lib/db.js'
import { config } from '../config.js'
import { confirmSchema } from '../schemas.js'

const TABLE = { signature: 'signatures', case: 'cases', claimant: 'claimants' }

/* Double opt-in confirmation. The link in the confirmation email points here.
   We mark the record confirmed and redirect the visitor back to the frontend.
   GDPR: confirmation is the affirmative step that makes consent demonstrable. */
export default async function confirmRoute(fastify) {
  fastify.get('/api/confirm', { schema: confirmSchema }, async (req, reply) => {
    const { type, token } = req.query
    const table = TABLE[type]

    const result = await query(
      `UPDATE ${table}
         SET confirmed_at = now(), confirm_token = NULL, updated_at = now()
       WHERE confirm_token = $1 AND confirmed_at IS NULL
       RETURNING id`,
      [token]
    )

    const status = result.rowCount === 1 ? 'confirmed' : 'invalid_or_used'
    return reply.redirect(
      `${config.frontendUrl}/?confirmed=${encodeURIComponent(
        type
      )}&status=${status}`
    )
  })
}
