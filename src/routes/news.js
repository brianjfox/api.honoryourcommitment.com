import { query } from '../lib/db.js'
import { config } from '../config.js'

// Serve the most recent curated batch of news articles. Cached in memory so
// the public page doesn't hit the DB on every load.
const TTL_MS = 5 * 60_000
let cache = { at: 0, data: null }

// Format a DATE column as YYYY-MM-DD from local components (avoids the UTC
// shift that toISOString() applies to a local-midnight DATE).
function ymd(d) {
  if (!d) return null
  const x = new Date(d)
  const m = String(x.getMonth() + 1).padStart(2, '0')
  const day = String(x.getDate()).padStart(2, '0')
  return `${x.getFullYear()}-${m}-${day}`
}

async function latestBatch() {
  const res = await query(
    `SELECT url, title, source, summary, published_date, language, fetched_at
       FROM news_articles
      WHERE batch_id = (
        SELECT batch_id FROM news_articles ORDER BY fetched_at DESC LIMIT 1
      )
      ORDER BY position ASC
      LIMIT $1`,
    [config.news.count]
  )
  return {
    articles: res.rows.map((r) => ({
      url: r.url,
      title: r.title,
      source: r.source,
      summary: r.summary,
      publishedDate: ymd(r.published_date),
      language: r.language,
    })),
    updatedAt: res.rows[0] ? new Date(res.rows[0].fetched_at).toISOString() : null,
  }
}

export default async function newsRoute(fastify) {
  fastify.get('/api/news', async () => {
    const now = Date.now()
    if (!cache.data || now - cache.at > TTL_MS) {
      cache = { at: now, data: await latestBatch() }
    }
    return cache.data
  })
}
