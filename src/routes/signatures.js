import { query } from '../lib/db.js'
import { config } from '../config.js'
import { signatureSchema } from '../schemas.js'
import { processSubmission } from '../lib/submit.js'

export default async function signaturesRoute(fastify) {
  fastify.post(
    '/api/signatures',
    { schema: signatureSchema, config: { rateLimit: fastify.submitRateLimit } },
    async (req, reply) => {
      const b = req.body
      return processSubmission(req, reply, {
        type: 'signature',
        email: b.email,
        locale: b.locale,
        doInsert: ({ token, ipHash }) =>
          query(
            `INSERT INTO signatures
               (first_name, last_name, email, country,
                consent_processing, consent_public, consent_contact,
                privacy_policy_version, locale, confirm_token, ip_hash)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             ON CONFLICT (email) DO UPDATE SET
               first_name = EXCLUDED.first_name,
               last_name  = EXCLUDED.last_name,
               country    = EXCLUDED.country,
               consent_public  = EXCLUDED.consent_public,
               consent_contact = EXCLUDED.consent_contact,
               confirm_token = EXCLUDED.confirm_token,
               locale = EXCLUDED.locale,
               updated_at = now()
             WHERE signatures.confirmed_at IS NULL
             RETURNING id`,
            [
              b.firstName,
              b.lastName,
              b.email.toLowerCase(),
              b.country,
              b.consentProcessing,
              b.consentPublic ?? false,
              b.consentContact ?? false,
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
