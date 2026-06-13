/* Resend double opt-in confirmation emails to records that are still
 * unconfirmed (e.g. everyone who submitted before email was configured).
 *
 *   node scripts/resend-confirmations.js [options]
 *     --dry-run            show who would be emailed; send nothing
 *     --type <t>           limit to one of: signature | case | claimant
 *     --email <addr>       only this address (across all types)
 *     --limit <n>          stop after n sends
 *     --delay-ms <n>       pause between sends (default 300) to respect rate limits
 *
 * One email is sent per unconfirmed record (each submission carries its own
 * consent + confirmation link). Records missing a token get a fresh one.
 * Requires DISABLE_EMAIL=false to actually send (otherwise it only logs links).
 */
import { query, closePool } from '../src/lib/db.js'
import { sendConfirmationEmail } from '../src/lib/email.js'
import { newToken } from '../src/lib/util.js'
import { config } from '../src/config.js'

const TABLES = [
  { type: 'signature', table: 'signatures' },
  { type: 'case', table: 'cases' },
  { type: 'claimant', table: 'claimants' },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function parseArgs(argv) {
  const o = { dryRun: false, type: null, email: null, limit: Infinity, delay: 300 }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') o.dryRun = true
    else if (a === '--type') o.type = argv[++i]
    else if (a === '--email') o.email = String(argv[++i]).toLowerCase()
    else if (a === '--limit') o.limit = parseInt(argv[++i], 10)
    else if (a === '--delay-ms') o.delay = parseInt(argv[++i], 10)
    else {
      console.error(`Unknown argument: ${a}`)
      process.exit(1)
    }
  }
  return o
}

async function main() {
  const opts = parseArgs(process.argv)
  const tables = opts.type
    ? TABLES.filter((t) => t.type === opts.type)
    : TABLES
  if (opts.type && !tables.length) {
    console.error('Invalid --type (use signature | case | claimant)')
    process.exit(1)
  }

  if (config.email.disabled && !opts.dryRun) {
    console.warn(
      'WARNING: DISABLE_EMAIL is true — links will be logged, not emailed. ' +
        'Set DISABLE_EMAIL=false to actually send.'
    )
  }

  const log = { info: (obj, msg) => console.log(msg || '', obj || '') }
  let sent = 0
  let failed = 0
  let candidates = 0

  for (const { type, table } of tables) {
    if (sent >= opts.limit) break
    const params = []
    let sql = `SELECT id, email, locale, confirm_token
               FROM public.${table} WHERE confirmed_at IS NULL`
    if (opts.email) {
      params.push(opts.email)
      sql += ` AND lower(email) = $1`
    }
    sql += ' ORDER BY created_at'
    const { rows } = await query(sql, params)
    candidates += rows.length

    for (const r of rows) {
      if (sent >= opts.limit) break
      let token = r.confirm_token
      if (opts.dryRun) {
        console.log(`would resend [${type}] → ${r.email}`)
        continue
      }
      try {
        if (!token) {
          token = newToken()
          await query(
            `UPDATE public.${table} SET confirm_token = $1, updated_at = now() WHERE id = $2`,
            [token, r.id]
          )
        }
        await sendConfirmationEmail(
          { to: r.email, type, token, locale: r.locale || 'en' },
          log
        )
        sent++
        console.log(`resent [${type}] → ${r.email}`)
        if (opts.delay) await sleep(opts.delay)
      } catch (err) {
        failed++
        console.error(`FAILED [${type}] → ${r.email}: ${err.message}`)
      }
    }
  }

  if (opts.dryRun) {
    console.log(`\nDry run: ${candidates} unconfirmed record(s) would be emailed.`)
  } else {
    console.log(`\nDone. Sent ${sent}, failed ${failed}, of ${candidates} unconfirmed.`)
  }
}

main()
  .catch((err) => {
    console.error('resend-confirmations failed:', err.message)
    process.exitCode = 1
  })
  .finally(closePool)
