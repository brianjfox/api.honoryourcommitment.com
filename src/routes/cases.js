import { query } from '../lib/db.js'
import { config } from '../config.js'
import { caseSchema } from '../schemas.js'
import { processSubmission } from '../lib/submit.js'

export default async function casesRoute(fastify) {
  fastify.post(
    '/api/cases',
    { schema: caseSchema, config: { rateLimit: fastify.submitRateLimit } },
    async (req, reply) => {
      const b = req.body
      return processSubmission(req, reply, {
        type: 'case',
        email: b.email,
        locale: b.locale,
        doInsert: ({ token, ipHash }) =>
          query(
            `INSERT INTO cases
               (first_name, last_name, email, phone, country,
                application_year, investment_type, investment_amount,
                family_members, status, story,
                consent_processing, privacy_policy_version, locale,
                confirm_token, ip_hash)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
             ON CONFLICT (email) DO UPDATE SET
               first_name = EXCLUDED.first_name,
               last_name  = EXCLUDED.last_name,
               phone      = EXCLUDED.phone,
               country    = EXCLUDED.country,
               application_year  = EXCLUDED.application_year,
               investment_type   = EXCLUDED.investment_type,
               investment_amount = EXCLUDED.investment_amount,
               family_members    = EXCLUDED.family_members,
               status = EXCLUDED.status,
               story  = EXCLUDED.story,
               confirm_token = EXCLUDED.confirm_token,
               locale = EXCLUDED.locale,
               updated_at = now()
             WHERE cases.confirmed_at IS NULL
             RETURNING id`,
            [
              b.firstName,
              b.lastName,
              b.email.toLowerCase(),
              b.phone || null,
              b.country,
              b.applicationYear,
              b.investmentType,
              b.investmentAmount ?? null,
              b.familyMembers ?? null,
              b.status || null,
              b.story || null,
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
