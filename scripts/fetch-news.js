/* Daily news curation.
 *
 * Uses Claude with the server-side web_search tool to find recent, credible
 * news articles about Portugal's residency / Golden Visa / AIMA backlog and
 * related policy changes, then has the model hand back a structured list via a
 * `submit_articles` tool. Real URLs come from the search results (not the
 * model's memory), so links are genuine. Validated results are stored as a new
 * batch in `news_articles`; the API serves the newest batch.
 *
 * Run by a systemd timer (see deploy/fetch-news.*). No-ops cleanly if
 * ANTHROPIC_API_KEY is unset. A failed/empty run leaves the previous batch
 * untouched.
 *
 * Provider note: this is Anthropic-specific (model id, web_search tool, SDK).
 */
import crypto from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { config } from '../src/config.js'
import { query, closePool } from '../src/lib/db.js'

const log = (...a) => console.log(new Date().toISOString(), ...a)

const SUBMIT_TOOL = {
  name: 'submit_articles',
  description:
    'Submit the final curated list of news articles. Call this exactly once, after searching, with 3-4 articles.',
  input_schema: {
    type: 'object',
    properties: {
      articles: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Article headline' },
            url: { type: 'string', description: 'Canonical article URL from the search results' },
            source: { type: 'string', description: 'Publication / outlet name' },
            published_date: { type: 'string', description: 'Publication date, YYYY-MM-DD' },
            summary: {
              type: 'string',
              description: 'One or two neutral sentences on what the article reports',
            },
            language: { type: 'string', description: 'ISO 639-1 code, e.g. en, pt' },
          },
          required: ['title', 'url', 'source', 'summary'],
        },
      },
    },
    required: ['articles'],
  },
}

function buildPrompt() {
  const today = new Date().toISOString().slice(0, 10)
  return `Today is ${today}. Find ${config.news.count} recent, credible news articles (published within the last ${config.news.lookbackDays} days) about ANY of the following, as they affect Golden Visa investors, residency applicants, and their families:

- Portugal's residency-permit and Golden Visa processing delays / backlog
- AIMA (Agência para a Integração, Migrações e Asilo) and its predecessor SEF
- Changes to Portugal's citizenship or residency law, especially retroactive changes
- Court rulings or government statements on these delays

Requirements:
- Use the web_search tool to find real, currently-published articles. Only use URLs that appear in the search results — never invent or guess a URL.
- Prefer reputable, varied sources (major newspapers, wire services, specialist outlets). Avoid forums, social media, and promotional/immigration-firm marketing pages.
- Each article must be genuinely relevant to the topics above. If you cannot find ${config.news.count} solidly relevant recent articles, return fewer rather than padding with weak matches.
- Write each summary in neutral, factual language. English summaries even if the article is in another language; set "language" to the article's original language.

When done, call submit_articles exactly once with the final list.`
}

function normalizeDate(s) {
  if (!s) return null
  const d = new Date(s)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function validate(articles) {
  if (!Array.isArray(articles)) return []
  const seen = new Set()
  const out = []
  for (const a of articles) {
    if (!a || typeof a !== 'object') continue
    const url = String(a.url || '').trim()
    const title = String(a.title || '').trim()
    const source = String(a.source || '').trim()
    const summary = String(a.summary || '').trim()
    if (!/^https?:\/\/.+\..+/i.test(url)) continue
    if (!title || !source || !summary) continue
    const key = url.replace(/[#?].*$/, '').toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      url,
      title: title.slice(0, 400),
      source: source.slice(0, 200),
      summary: summary.slice(0, 1000),
      published_date: normalizeDate(a.published_date),
      language: (String(a.language || 'en').trim().slice(0, 8)) || 'en',
    })
    if (out.length >= config.news.count) break
  }
  return out
}

// Drive the model: search, then capture the submit_articles tool call.
async function curate(client) {
  const tools = [
    { type: 'web_search_20260209', name: 'web_search' },
    SUBMIT_TOOL,
  ]
  const messages = [{ role: 'user', content: buildPrompt() }]

  for (let step = 0; step < 8; step++) {
    const resp = await client.messages.create({
      model: config.anthropic.model,
      max_tokens: 6000,
      thinking: { type: 'adaptive' },
      tools,
      messages,
    })

    const call = resp.content.find(
      (b) => b.type === 'tool_use' && b.name === 'submit_articles'
    )
    if (call) return call.input?.articles ?? []

    // Server-side tool loop hit its cap — echo content back verbatim to resume.
    if (resp.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: resp.content })
      continue
    }

    if (resp.stop_reason === 'end_turn') {
      log('Model ended without calling submit_articles.')
      return []
    }

    // Any other (unexpected) tool use — record and continue the loop.
    messages.push({ role: 'assistant', content: resp.content })
  }
  log('Reached step limit without a submission.')
  return []
}

async function store(articles) {
  const batchId = crypto.randomUUID()
  for (let i = 0; i < articles.length; i++) {
    const a = articles[i]
    await query(
      `INSERT INTO news_articles
         (url, title, source, summary, published_date, language, batch_id, position, fetched_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
       ON CONFLICT (url) DO UPDATE SET
         title = EXCLUDED.title,
         source = EXCLUDED.source,
         summary = EXCLUDED.summary,
         published_date = EXCLUDED.published_date,
         language = EXCLUDED.language,
         batch_id = EXCLUDED.batch_id,
         position = EXCLUDED.position,
         fetched_at = now()`,
      [a.url, a.title, a.source, a.summary, a.published_date, a.language, batchId, i]
    )
  }
  return batchId
}

async function main() {
  if (!config.anthropic.apiKey) {
    log('ANTHROPIC_API_KEY not set — skipping news fetch.')
    return
  }
  const client = new Anthropic({ apiKey: config.anthropic.apiKey })

  log(`Curating up to ${config.news.count} articles with ${config.anthropic.model}…`)
  const raw = await curate(client)
  const articles = validate(raw)

  if (articles.length === 0) {
    log('No valid articles found — leaving the existing batch in place.')
    return
  }

  const batchId = await store(articles)
  log(`Stored ${articles.length} article(s) as batch ${batchId}:`)
  for (const a of articles) log(`  • ${a.source}: ${a.title} — ${a.url}`)
}

main()
  .catch((err) => {
    console.error(new Date().toISOString(), 'fetch-news failed:', err?.message || err)
    process.exitCode = 1
  })
  .finally(async () => {
    await closePool()
  })
