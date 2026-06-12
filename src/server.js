import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { config, warnInsecureDefaults } from './config.js'
import { closePool, pool } from './lib/db.js'
import signaturesRoute from './routes/signatures.js'
import casesRoute from './routes/cases.js'
import claimantsRoute from './routes/claimants.js'
import confirmRoute from './routes/confirm.js'
import statsRoute from './routes/stats.js'
import newsRoute from './routes/news.js'
import pressRoute from './routes/press.js'

export async function buildServer() {
  const app = Fastify({
    // Behind Nginx: trust the proxy so req.ip reflects X-Forwarded-For.
    trustProxy: true,
    logger: {
      level: config.isProd ? 'info' : 'debug',
      transport: config.isProd
        ? undefined
        : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } },
    },
    bodyLimit: 64 * 1024, // 64 KB — these are small forms
  })

  await app.register(helmet, { contentSecurityPolicy: false })

  await app.register(cors, {
    origin: config.frontendUrl,
    methods: ['GET', 'POST'],
    credentials: false,
  })

  // Global per-IP rate limit (a safety net across all routes).
  await app.register(rateLimit, {
    global: true,
    max: config.rateLimit.globalMax,
    timeWindow: config.rateLimit.globalWindow,
  })

  // Stricter per-IP limit applied to the submission routes (anti-abuse;
  // keeps the signature/case counts credible). Referenced via route config.
  app.decorate('submitRateLimit', {
    max: config.rateLimit.submitMax,
    timeWindow: config.rateLimit.submitWindow,
  })

  app.get('/api/health', async () => {
    await pool.query('SELECT 1')
    return { ok: true, service: 'api.honoryourcommitment.com' }
  })

  await app.register(signaturesRoute)
  await app.register(casesRoute)
  await app.register(claimantsRoute)
  await app.register(confirmRoute)
  await app.register(statsRoute)
  await app.register(newsRoute)
  await app.register(pressRoute)

  // Don't leak internals on unexpected errors.
  app.setErrorHandler((err, req, reply) => {
    req.log.error(err)
    if (err.validation) {
      return reply.code(400).send({ ok: false, error: 'validation_failed' })
    }
    if (err.statusCode === 429) {
      return reply.code(429).send({ ok: false, error: 'rate_limited' })
    }
    return reply.code(err.statusCode || 500).send({ ok: false, error: 'server_error' })
  })

  return app
}

// Start only when run directly (not when imported by tests/smoke).
const isMain =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`

if (isMain) {
  const app = await buildServer()
  warnInsecureDefaults(app.log)

  const shutdown = async (signal) => {
    app.log.info(`Received ${signal}, shutting down…`)
    try {
      await app.close()
      await closePool()
      process.exit(0)
    } catch (err) {
      app.log.error(err)
      process.exit(1)
    }
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))

  try {
    await app.listen({ host: config.host, port: config.port })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}
