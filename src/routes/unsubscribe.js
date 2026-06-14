import { query } from '../lib/db.js'
import { config } from '../config.js'
import { verifyUnsubToken } from '../lib/unsubscribe.js'

/* Public unsubscribe for campaign-update broadcasts.

   GET  /api/unsubscribe?token=...  → a small confirmation page with a button
        (a GET must never mutate — and mail clients sometimes prefetch links).
   POST /api/unsubscribe?token=...  → performs the opt-out. This is also the
        RFC 8058 one-click target referenced by the List-Unsubscribe header,
        so mail clients can unsubscribe the user in one tap.

   Opting out both records a suppression row and flips signatures.consent_contact
   to false, so the opt-out survives even if the suppression list is edited. */

const COPY = {
  en: {
    title: 'Unsubscribe',
    confirmH: 'Unsubscribe from campaign updates?',
    confirmP: 'You will no longer receive campaign-update emails at this address.',
    button: 'Confirm unsubscribe',
    doneH: 'You have been unsubscribed',
    doneP: 'You will no longer receive campaign-update emails. You can still take action on the site at any time.',
    invalidH: 'This link is no longer valid',
    invalidP: 'The unsubscribe link is invalid or has expired. If you keep receiving emails, contact us at info@honoryourcommitment.com.',
  },
  pt: {
    title: 'Cancelar subscrição',
    confirmH: 'Cancelar a subscrição das atualizações da campanha?',
    confirmP: 'Deixará de receber e-mails de atualização da campanha neste endereço.',
    button: 'Confirmar cancelamento',
    doneH: 'A sua subscrição foi cancelada',
    doneP: 'Deixará de receber e-mails de atualização da campanha. Pode continuar a participar no site a qualquer momento.',
    invalidH: 'Esta ligação já não é válida',
    invalidP: 'A ligação de cancelamento é inválida ou expirou. Se continuar a receber e-mails, contacte-nos em info@honoryourcommitment.com.',
  },
  es: {
    title: 'Cancelar suscripción',
    confirmH: '¿Cancelar la suscripción a las novedades de la campaña?',
    confirmP: 'Dejará de recibir correos con novedades de la campaña en esta dirección.',
    button: 'Confirmar cancelación',
    doneH: 'Te has dado de baja',
    doneP: 'Dejarás de recibir correos con novedades de la campaña. Puedes seguir participando en el sitio en cualquier momento.',
    invalidH: 'Este enlace ya no es válido',
    invalidP: 'El enlace para darse de baja no es válido o ha caducado. Si sigues recibiendo correos, escríbenos a info@honoryourcommitment.com.',
  },
  zh: {
    title: '取消订阅',
    confirmH: '取消订阅活动更新？',
    confirmP: '此邮箱将不再收到活动更新邮件。',
    button: '确认取消订阅',
    doneH: '您已取消订阅',
    doneP: '您将不再收到活动更新邮件。您仍可随时在网站上参与行动。',
    invalidH: '此链接已失效',
    invalidP: '取消订阅链接无效或已过期。如果您仍收到邮件，请联系 info@honoryourcommitment.com。',
  },
}

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

function page(lang, heading, paragraph, formAction) {
  const c = COPY[lang] || COPY.en
  const button = formAction
    ? `<form method="POST" action="${esc(formAction)}"><button type="submit">${esc(c.button)}</button></form>`
    : ''
  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(c.title)} — Honor Your Commitment</title>
<style>
  :root { color-scheme: light; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
         background:#f4f7fb; color:#15212e; display:grid; place-items:center; min-height:100vh; padding:1rem; }
  .card { background:#fff; border:1px solid #dde4ec; border-radius:12px; padding:2rem; max-width:480px;
          box-shadow:0 12px 40px rgba(6,26,48,.12); }
  .brand { font-weight:800; color:#0a2342; margin-bottom:1rem; display:flex; align-items:center; gap:.5rem; }
  .shield { width:14px; height:18px; background:#c9a14a; border-radius:3px 3px 8px 8px; display:inline-block; }
  h1 { font-size:1.3rem; color:#0a2342; margin:.2rem 0 .8rem; }
  p { color:#51647a; line-height:1.5; }
  button { font:inherit; font-weight:600; cursor:pointer; margin-top:1rem;
           background:#c9a14a; border:1px solid #c9a14a; color:#061a30; padding:.6em 1.1em; border-radius:6px; }
  button:hover { background:#d9b665; }
</style>
</head>
<body>
  <div class="card">
    <div class="brand"><span class="shield"></span> Honor Your Commitment</div>
    <h1>${esc(heading)}</h1>
    <p>${esc(paragraph)}</p>
    ${button}
  </div>
</body>
</html>`
}

export default async function unsubscribeRoute(fastify) {
  const langOf = (q) => (COPY[q.lang] ? q.lang : 'en')

  // Show a confirmation page (never mutate on GET).
  fastify.get('/api/unsubscribe', async (req, reply) => {
    const lang = langOf(req.query)
    const email = verifyUnsubToken(req.query.token, config.unsubscribeSecret)
    const c = COPY[lang]
    if (!email) {
      return reply.type('text/html').send(page(lang, c.invalidH, c.invalidP))
    }
    const action = `/api/unsubscribe?token=${encodeURIComponent(req.query.token)}&lang=${lang}`
    return reply.type('text/html').send(page(lang, c.confirmH, c.confirmP, action))
  })

  // Perform the opt-out. Also the RFC 8058 one-click target.
  fastify.post('/api/unsubscribe', async (req, reply) => {
    const lang = langOf(req.query)
    const email = verifyUnsubToken(req.query.token, config.unsubscribeSecret)
    const c = COPY[lang]
    if (!email) {
      return reply.type('text/html').send(page(lang, c.invalidH, c.invalidP))
    }
    await query(
      `INSERT INTO public.email_suppressions (email, reason)
       VALUES ($1, 'unsubscribe') ON CONFLICT (email) DO NOTHING`,
      [email]
    )
    await query(
      `UPDATE public.signatures SET consent_contact = false, updated_at = now()
       WHERE lower(email) = $1 AND consent_contact = true`,
      [email]
    )
    req.log.info({ email }, 'broadcast unsubscribe')
    return reply.type('text/html').send(page(lang, c.doneH, c.doneP))
  })
}
