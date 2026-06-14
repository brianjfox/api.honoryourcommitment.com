import nodemailer from 'nodemailer'
import { config } from '../config.js'

// Build an SMTP transport from config. Works with any provider (Scaleway TEM,
// Mailjet, Brevo, etc.) — they all expose standard SMTP credentials.
function makeTransport() {
  if (!config.email.host) throw new Error('SMTP_HOST is not configured')
  return nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.secure, // true for 465, false for 587 (STARTTLS)
    auth:
      config.email.user || config.email.pass
        ? { user: config.email.user, pass: config.email.pass }
        : undefined,
  })
}

let transporter = null
function getTransporter() {
  if (config.email.disabled) return null
  if (!transporter) transporter = makeTransport()
  return transporter
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

/* Notify internal staff that a new submission arrived (pending confirmation).
   `lines` is an array of [label, value] pairs. No-op when email is disabled,
   no recipients are configured, or this event type isn't subscribed. */
export async function sendStaffNotification(type, lines, log) {
  if (config.email.disabled) {
    log?.info({ type }, 'EMAIL DISABLED — staff notification skipped')
    return
  }
  if (!config.notify.emails.length || !config.notify.events.includes(type)) return

  const text = lines.map(([k, v]) => `${k}: ${v}`).join('\n')
  const htmlRows = lines
    .map(
      ([k, v]) =>
        `<tr><td style="padding:2px 12px 2px 0;color:#555">${escapeHtml(k)}</td>` +
        `<td><strong>${escapeHtml(v)}</strong></td></tr>`
    )
    .join('')
  await getTransporter().sendMail({
    from: config.email.from,
    to: config.notify.emails.join(', '),
    replyTo: config.email.replyTo || undefined,
    subject: `New ${type} registered — Portugal Must Honor Its Commitments`,
    text: `A new ${type} was submitted (pending email confirmation):\n\n${text}`,
    html: `<p>A new <strong>${escapeHtml(type)}</strong> was submitted (pending email confirmation):</p><table>${htmlRows}</table>`,
  })
}

// Verify SMTP credentials, then send a one-off test email. Ignores
// DISABLE_EMAIL so you can validate a provider before turning sending on.
export async function sendTestEmail(to) {
  const t = makeTransport()
  await t.verify()
  await t.sendMail({
    from: config.email.from,
    replyTo: config.email.replyTo || undefined,
    to,
    subject: 'Test — Portugal Must Honor Its Commitments',
    text: 'SMTP is configured correctly. This is a test message from the campaign API.',
    html: '<p><strong>SMTP is configured correctly.</strong></p><p>This is a test message from the campaign API.</p>',
  })
  return { sent: true }
}

// Minimal localized copy for the double opt-in email. English is the
// fallback for any unsupported locale.
const COPY = {
  en: {
    subject: 'Please confirm — Portugal Must Honor Its Commitments',
    line1: 'Thank you for taking action.',
    line2:
      'Please confirm your submission by clicking the button below. Your record only counts once confirmed.',
    button: 'Confirm',
    ignore: "If you didn't make this request, you can safely ignore this email.",
  },
  pt: {
    subject: 'Confirme, por favor — Portugal Deve Honrar os Seus Compromissos',
    line1: 'Obrigado por agir.',
    line2:
      'Confirme a sua submissão clicando no botão abaixo. O seu registo só conta depois de confirmado.',
    button: 'Confirmar',
    ignore: 'Se não fez este pedido, pode ignorar este email com segurança.',
  },
  es: {
    subject: 'Confirme, por favor — Portugal Debe Honrar Sus Compromisos',
    line1: 'Gracias por actuar.',
    line2:
      'Confirme su envío haciendo clic en el botón de abajo. Su registro solo cuenta una vez confirmado.',
    button: 'Confirmar',
    ignore: 'Si no realizó esta solicitud, puede ignorar este correo.',
  },
  zh: {
    subject: '请确认 — 葡萄牙必须信守承诺',
    line1: '感谢您采取行动。',
    line2: '请点击下方按钮确认您的提交。您的记录仅在确认后才计入。',
    button: '确认',
    ignore: '如果您并未发起此请求，可以安全地忽略此邮件。',
  },
}

function renderHtml(c, url) {
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#15212e;line-height:1.6">
  <div style="max-width:520px;margin:0 auto;padding:24px">
    <h2 style="color:#0a2342">Portugal Must Honor Its Commitments</h2>
    <p>${c.line1}</p>
    <p>${c.line2}</p>
    <p style="margin:28px 0">
      <a href="${url}" style="background:#c9a14a;color:#061a30;font-weight:bold;
         padding:12px 22px;border-radius:6px;text-decoration:none;display:inline-block">
        ${c.button}
      </a>
    </p>
    <p style="font-size:13px;color:#46586a">${c.ignore}</p>
    <p style="font-size:12px;color:#8a98a6;word-break:break-all">${url}</p>
  </div></body></html>`
}

/* Send (or, in dev, log) the double opt-in confirmation email. */
export async function sendConfirmationEmail({ to, type, token, locale }, log) {
  const c = COPY[locale] || COPY.en
  const url = `${config.apiPublicUrl}/api/confirm?type=${encodeURIComponent(
    type
  )}&token=${encodeURIComponent(token)}`

  if (config.email.disabled) {
    log.info({ to, type, url }, 'EMAIL DISABLED — confirmation link (dev)')
    return { sent: false, url }
  }

  await getTransporter().sendMail({
    from: config.email.from,
    replyTo: config.email.replyTo || undefined,
    to,
    subject: c.subject,
    html: renderHtml(c, url),
    text: `${c.line1}\n\n${c.line2}\n\n${url}\n\n${c.ignore}`,
  })
  return { sent: true }
}
