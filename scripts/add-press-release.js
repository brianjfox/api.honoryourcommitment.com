/* Add a press release from the command line.
 *
 *   node scripts/add-press-release.js path/to/release.json
 *   node scripts/add-press-release.js '{"title":"...","summary":"...","date":"2026-06-12","url":"..."}'
 *
 * JSON fields: title (required), summary (required), url, body, date
 * (YYYY-MM-DD, defaults to today), published (default true).
 */
import { readFileSync } from 'node:fs'
import { query, closePool } from '../src/lib/db.js'

function loadInput(arg) {
  if (!arg) throw new Error('Provide a JSON string or a path to a .json file.')
  const text = arg.trim().startsWith('{') ? arg : readFileSync(arg, 'utf8')
  return JSON.parse(text)
}

async function main() {
  const pr = loadInput(process.argv[2])
  const title = String(pr.title || '').trim()
  const summary = String(pr.summary || '').trim()
  if (!title || !summary) throw new Error('Both "title" and "summary" are required.')

  const date =
    pr.date && /^\d{4}-\d{2}-\d{2}$/.test(pr.date)
      ? pr.date
      : new Date().toISOString().slice(0, 10)

  const res = await query(
    `INSERT INTO press_releases (title, summary, body, url, published_date, published)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id`,
    [
      title,
      summary,
      pr.body || null,
      pr.url || null,
      date,
      pr.published === false ? false : true,
    ]
  )
  console.log(`Added press release ${res.rows[0].id} (${date}): ${title}`)
}

main()
  .catch((err) => {
    console.error('Failed:', err.message)
    process.exitCode = 1
  })
  .finally(closePool)
