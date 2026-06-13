/* Send a test email to verify the SMTP provider is configured correctly.
 *
 *   node scripts/test-email.js you@example.com
 *
 * Uses the SMTP_* settings from .env. Runs even when DISABLE_EMAIL=true, so you
 * can validate a provider (credentials, SPF/DKIM, deliverability) before turning
 * confirmation emails on. Verifies the connection first, then sends.
 */
import { sendTestEmail } from '../src/lib/email.js'
import { config } from '../src/config.js'

const to = process.argv[2]
if (!to) {
  console.error('Usage: node scripts/test-email.js <to@example.com>')
  process.exit(1)
}
if (!config.email.host) {
  console.error('SMTP_HOST is not set in .env — configure your provider first.')
  process.exit(1)
}

console.log(`Connecting to ${config.email.host}:${config.email.port} as ${config.email.user || '(no auth)'}…`)
sendTestEmail(to)
  .then(() => {
    console.log(`✓ Sent a test email to ${to} (from ${config.email.from}).`)
    console.log('  Check the inbox AND the spam folder. If it landed in spam,')
    console.log('  finish SPF/DKIM/DMARC on the sending domain.')
  })
  .catch((err) => {
    console.error('✗ Failed:', err.message)
    process.exit(1)
  })
