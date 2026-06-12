import { query } from '../lib/db.js'

// Serve published first-party press releases, newest first. Cached in memory.
const TTL_MS = 5 * 60_000
let cache = { at: 0, data: null }

// Format a DATE column as YYYY-MM-DD using local components (pg returns DATE as
// a Date at local midnight; toISOString would shift it across the UTC boundary).
function ymd(d) {
  if (!d) return null
  const x = new Date(d)
  const m = String(x.getMonth() + 1).padStart(2, '0')
  const day = String(x.getDate()).padStart(2, '0')
  return `${x.getFullYear()}-${m}-${day}`
}

async function load() {
  const res = await query(
    `SELECT id, title, summary, url, published_date
       FROM press_releases
      WHERE published
      ORDER BY published_date DESC, created_at DESC
      LIMIT 12`
  )
  return {
    items: res.rows.map((r) => ({
      id: r.id,
      title: r.title,
      summary: r.summary,
      url: r.url || null,
      date: ymd(r.published_date),
    })),
  }
}

export default async function pressRoute(fastify) {
  fastify.get('/api/press-releases', async () => {
    const now = Date.now()
    if (!cache.data || now - cache.at > TTL_MS) {
      cache = { at: now, data: await load() }
    }
    return cache.data
  })
}
