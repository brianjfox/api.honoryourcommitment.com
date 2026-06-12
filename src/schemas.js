// JSON Schemas for request validation. Fastify validates and rejects
// anything that doesn't match (additionalProperties:false), so the
// handlers can trust their input.

// Email via pattern (avoids depending on ajv-formats).
const email = {
  type: 'string',
  pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$',
  maxLength: 320,
}
const shortText = { type: 'string', minLength: 1, maxLength: 200 }
const optText = { type: 'string', maxLength: 200 }
const locale = { type: 'string', enum: ['en', 'pt', 'zh', 'es'] }
const turnstileToken = { type: 'string', maxLength: 4096 }
// Honeypot: accepted by the schema but inspected in the handler, which
// silently drops any request where it's non-empty (so bots see "success").
const botcheck = { type: 'string', maxLength: 256 }
// consent that MUST be granted (server-enforced affirmative consent)
const consentTrue = { type: 'boolean', const: true }

export const signatureSchema = {
  body: {
    type: 'object',
    required: ['firstName', 'lastName', 'email', 'country', 'consentProcessing'],
    additionalProperties: false,
    properties: {
      firstName: shortText,
      lastName: shortText,
      email,
      country: shortText,
      consentProcessing: consentTrue,
      consentPublic: { type: 'boolean', default: false },
      consentContact: { type: 'boolean', default: false },
      locale,
      turnstileToken,
      botcheck,
    },
  },
}

export const caseSchema = {
  body: {
    type: 'object',
    required: [
      'firstName',
      'lastName',
      'email',
      'country',
      'applicationYear',
      'investmentType',
      'consentProcessing',
    ],
    additionalProperties: false,
    properties: {
      firstName: shortText,
      lastName: shortText,
      email,
      phone: { type: 'string', maxLength: 40 },
      country: shortText,
      applicationYear: { type: 'integer', minimum: 2000, maximum: 2100 },
      investmentType: shortText,
      investmentAmount: { type: 'number', minimum: 0, maximum: 1000000000 },
      familyMembers: { type: 'integer', minimum: 0, maximum: 100 },
      status: optText,
      story: { type: 'string', maxLength: 5000 },
      consentProcessing: consentTrue,
      locale,
      turnstileToken,
      botcheck,
    },
  },
}

export const claimantSchema = {
  body: {
    type: 'object',
    required: ['fullName', 'email', 'country', 'consentProcessing'],
    additionalProperties: false,
    properties: {
      fullName: shortText,
      email,
      country: shortText,
      applicationYear: { type: 'integer', minimum: 2000, maximum: 2100 },
      message: { type: 'string', maxLength: 5000 },
      consentProcessing: consentTrue,
      locale,
      turnstileToken,
      botcheck,
    },
  },
}

export const confirmSchema = {
  querystring: {
    type: 'object',
    required: ['type', 'token'],
    properties: {
      type: { type: 'string', enum: ['signature', 'case', 'claimant'] },
      token: { type: 'string', minLength: 10, maxLength: 200 },
    },
  },
}
