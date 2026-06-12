# api.honoryourcommitment.com

API server for the **Portugal Must Honor Its Commitments** campaign. Handles
petition signatures, case registration, and legal-claimant registration, plus
the public statistics that feed the site's live counters.

Built with **Fastify + Postgres** (Node 20+, ESM). Designed to run on the same
EU VPS as the frontend, behind Nginx, with Postgres bound to localhost.

## Architecture

```
Browser (SPA)  →  Nginx (TLS)  →  /api/*  →  Fastify (127.0.0.1:3000)  →  Postgres (localhost)
```

## Endpoints

| Method | Path               | Purpose                                            |
| ------ | ------------------ | -------------------------------------------------- |
| POST   | `/api/signatures`  | Sign the petition                                  |
| POST   | `/api/cases`       | Register a case (evidence base)                    |
| POST   | `/api/claimants`   | Join the legal action                              |
| GET    | `/api/confirm`     | Double opt-in confirmation (from the email link)   |
| GET    | `/api/stats`       | Aggregated public counters (confirmed records only)|
| GET    | `/api/news`        | Latest daily-curated news coverage (newest batch)  |
| GET    | `/api/press-releases` | First-party press releases (newest first)       |
| GET    | `/api/health`      | Liveness + DB check                                |

### Request contract (POST endpoints)

Every submission body should include:

- The form fields (see `src/schemas.js` for exact shapes and limits).
- `consentProcessing: true` — **required**; the server rejects anything else.
- `turnstileToken` — the Cloudflare Turnstile token (required unless
  `DISABLE_TURNSTILE=true`).
- `botcheck` — a **honeypot**: a hidden field that must be empty/absent. If a
  value is present the request is silently accepted (200) but stored nowhere.
- `locale` — `en` | `pt` | `zh` | `es` (controls the confirmation email).

Responses: `201 { status: "pending_confirmation" }` on success,
`200 { status: "already_confirmed" }` if the email already confirmed,
`400 { error: "validation_failed" | "captcha_failed" }`, `429` if rate-limited.

## How it protects the data (and the counts)

- **Double opt-in**: a record is created unconfirmed; the user must click the
  link emailed to them. Only **confirmed** records count toward `/api/stats`.
  This gives demonstrable GDPR consent and keeps signature counts credible.
- **Server-enforced consent**: `consentProcessing` must be `true`
  (`const: true` in the schema). The privacy-policy version and a timestamp are
  stored with every record for auditability.
- **Turnstile + honeypot + rate limiting** guard the public write endpoints.
- **IP minimization**: only a salted SHA-256 hash of the IP is stored, never
  the raw address.
- **Postgres on localhost**, 64 KB body limit, Helmet headers, strict CORS to
  the frontend origin.

## Local development

Requires Postgres running locally.

```bash
npm install
cp .env.example .env          # defaults are dev-friendly:
                              # DISABLE_TURNSTILE=true, DISABLE_EMAIL=true

createdb phyc                 # or set DATABASE_URL to your DB
npm run migrate               # create tables
npm run dev                   # http://127.0.0.1:3000
npm run smoke                 # end-to-end checks (inject-based, no network)
```

With `DISABLE_EMAIL=true`, the confirmation link is **logged to the console**
instead of being sent — open it to confirm a test submission.

## Going to production

1. **Provision** an EU VPS (Hetzner recommended), install Node 20+, Postgres,
   and Nginx.
2. **Database**: create a role + database; keep Postgres bound to `localhost`.
3. **Deploy** this directory to `/opt/api.honoryourcommitment.com`, run
   `npm ci --omit=dev` and `npm run migrate`.
4. **Configure** `.env` (chmod 600): set `NODE_ENV=production`, a real
   `DATABASE_URL`, a long random `IP_HASH_SALT` (`openssl rand -hex 32`),
   `FRONTEND_URL`, `API_PUBLIC_URL`, the Turnstile secret, and SMTP creds.
   Set `DISABLE_TURNSTILE=false` and `DISABLE_EMAIL=false`.
5. **Service**: install `deploy/api.honoryourcommitment.service`,
   `systemctl enable --now api.honoryourcommitment`.
6. **Proxy + TLS**: install `deploy/nginx.conf`, then
   `certbot --nginx -d api.honoryourcommitment.com`.

## Connecting the frontend

Point the React forms at these endpoints (replace the simulated submit in
`www.honoryourcommitment.com/src/components/Form.jsx`) and the live counters at
`GET /api/stats`. Add a Cloudflare Turnstile widget to each form and send its
token as `turnstileToken`, plus the hidden `botcheck` honeypot field. The
`/api/stats` response is shaped to match the frontend's existing data
(`signatures`, `cases`, `countries`, `combinedYears`, `capitalInvested`, plus
`capitalByCountry` / `pendingByYear` / `investmentByRoute` for the dashboard).

## Daily news curation

`scripts/fetch-news.js` uses **Claude + the server-side web-search tool** to find
3–4 recent, credible articles about Portugal's residency/Golden Visa delays and
related policy changes, then has the model return them via a `submit_articles`
tool. URLs come from real search results (not the model's memory), so links are
genuine. Results are validated (real http(s) URL, deduped, capped) and written
as a new batch in `news_articles`; `GET /api/news` serves the newest batch. The
frontend Media Center renders it, falling back to its static list if empty.

- **Enable**: set `ANTHROPIC_API_KEY` in `.env` (blank = the script no-ops).
- **Model**: `ANTHROPIC_MODEL` (default `claude-opus-4-8`; set a cheaper model
  like `claude-haiku-4-5` to reduce cost).
- **Schedule**: `deploy/fetch-news.timer` runs it daily (~06:30, with catch-up).
  Run once manually with `npm run fetch-news` or `sudo systemctl start fetch-news`.
- **Safety**: a failed or empty run leaves the previous batch in place, so the
  section never goes blank. Only valid, deduped articles are stored.
- **Cost** (rough): web search bills per search plus tokens; a daily Opus run is
  on the order of a few US cents to ~$0.20/day. Switch `ANTHROPIC_MODEL` down to
  trim it.

## Press releases (first-party)

Press releases are **your own statements**, not AI-generated. They're stored in
the `press_releases` table and served by `GET /api/press-releases`. The frontend
hides the whole section when there are none.

Add one from the command line (run in the API directory, on the server or
locally with `DATABASE_URL` set):

```bash
npm run add-press-release -- '{"title":"...","summary":"...","date":"2026-06-12","url":"https://..."}'
# or from a file:
npm run add-press-release -- ./release.json
```

Fields: `title` and `summary` are required; `url`, `body`, `date` (YYYY-MM-DD,
defaults to today), and `published` (default true) are optional. Set
`published:false` to stage a draft that the API won't serve yet.

## Email & Turnstile

- **SMTP** is plain `nodemailer` — fill `SMTP_*` in `.env` when ready. Prefer an
  EU provider (Scaleway TEM, Mailjet) for data-residency consistency.
- **Turnstile** secret goes in `TURNSTILE_SECRET`; the matching site key goes in
  the frontend widget.
