import { query } from '../lib/db.js'
import { config } from '../config.js'
import { claimantSchema } from '../schemas.js'
import { processSubmission } from '../lib/submit.js'

export default async function claimantsRoute(fastify) {
  fastify.post(
    '/api/claimants',
    { schema: claimantSchema, config: { rateLimit: fastify.submitRateLimit } },
    async (req, reply) => {
      const b = req.body
      return processSubmission(req, reply, {
        type: 'claimant',
        email: b.email,
        locale: b.locale,
        doInsert: ({ token, ipHash }) =>
          query(
            `INSERT INTO claimants
               (full_name, email, country, application_year, message,
                consent_processing, privacy_policy_version, locale,
                confirm_token, ip_hash)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             ON CONFLICT (email) DO UPDATE SET
               full_name = EXCLUDED.full_name,
               country   = EXCLUDED.country,
               application_year = EXCLUDED.application_year,
               message = EXCLUDED.message,
               confirm_token = EXCLUDED.confirm_token,
               locale = EXCLUDED.locale,
               updated_at = now()
             WHERE claimants.confirmed_at IS NULL
             RETURNING id`,
            [
              b.fullName,
              b.email.toLowerCase(),
              b.country,
              b.applicationYear ?? null,
              b.message || null,
              b.consentProcessing,
              config.privacyPolicyVersion,
              b.locale || 'en',
              token,
              ipHash,
            ]
          ),
      })
    }
  )
}
