# Deployment Runbook

How to deploy and operate **Portugal Must Honor Its Commitments** in production.

- **Frontend** (static SPA): `github.com/brianjfox/www.honoryourcommitment.com`
- **API** (Fastify + Postgres): `github.com/brianjfox/api.honoryourcommitment.com`
- Both deploy from the **`main`** branch — the server pulls from GitHub.

| Thing | Value |
| --- | --- |
| Canonical site | `https://honoryourcommitment.com` (apex) |
| `www` host | `https://www.honoryourcommitment.com` → 301 → apex |
| API | `https://api.honoryourcommitment.com` |
| Frontend web root | `/var/www/www.honoryourcommitment.com` |
| API directory | `/opt/api.honoryourcommitment.com` |
| API env file | `/opt/api.honoryourcommitment.com/.env` (chmod 600, owner `phyc`) |
| Admin (sudo) user | `deploy` |
| App (service) user | `phyc` |
| Provisioner | `provision-server.sh` (run from your **local** machine) |

> **Secrets live only in the server `.env`** — never in either git repo. The
> Turnstile *site* key is public and is committed in the frontend; the Turnstile
> *secret* key, the Anthropic key, the DB password, the IP-hash salt, and SMTP
> credentials live only in `/opt/api.honoryourcommitment.com/.env`.

---

## 0. Prerequisites (once)

1. A fresh Ubuntu server you can SSH into **as root** (Hetzner recommended; EU).
2. **DNS** A/AAAA records pointing at the server's IP for all three names —
   set these *before* provisioning so Let's Encrypt can issue certificates:
   - `honoryourcommitment.com`
   - `www.honoryourcommitment.com`
   - `api.honoryourcommitment.com`
   Verify: `dig +short honoryourcommitment.com www.honoryourcommitment.com api.honoryourcommitment.com`
3. A local SSH key (`~/.ssh/id_ed25519.pub` or similar) — the provisioner
   installs it for the `deploy` user and then disables password login.
4. **Cloudflare Turnstile** widget (mode **Managed**) with allowed hostnames
   `honoryourcommitment.com`, `www.honoryourcommitment.com` (+ `localhost` for
   dev). Note the **site key** (already in the frontend) and the **secret key**.

---

## 1. Provision / deploy

The provisioner is **idempotent** and is also the deploy tool — re-running it
pulls the latest `main` for both repos and rolls everything forward.

From your local machine, in the directory that contains `provision-server.sh`:

```bash
./provision-server.sh <server-host-or-ip>
```

A run does all of this:

- Base hardening: sudo `deploy` user + dedicated `phyc` user, swap, UFW
  (SSH + Nginx), fail2ban, automatic security updates, SSH key-only login.
- Installs Node, PostgreSQL, Nginx, Certbot.
- **Pulls both repos** from `main` (`git reset --hard origin/main`; ignores
  `.env` and `node_modules`).
- **API**: `npm ci --omit=dev` + `npm run migrate` (applies all migrations),
  generates `.env` **only if absent**, enables + restarts the service, health-checks it.
- **Frontend**: `npm ci && npm run build`, publishes `dist/` to the web root.
- **Nginx**: apex serves the SPA; `www` 301-redirects to apex; `api` reverse-proxies to `127.0.0.1:3000`.
- **TLS**: issues Let's Encrypt certs for any of the three names whose DNS
  already resolves to the box (skipped names print the exact `certbot` command).
- **Daily news timer** (`fetch-news.timer`, ~06:30).

> First run can't issue certs if DNS wasn't pointed yet — once DNS is live,
> just **re-run the provisioner** and it will obtain them.

---

## 2. Set production secrets

The provisioner creates `.env` with safe placeholders (Turnstile + email
disabled, no Anthropic key) and **never overwrites it on re-runs**, so your
secrets survive redeploys. Set the real values once:

```bash
ssh deploy@<server-host>
sudo nano /opt/api.honoryourcommitment.com/.env
```

```ini
# Cloudflare Turnstile — the SECRET key (not the site key)
TURNSTILE_SECRET=<turnstile secret key>
DISABLE_TURNSTILE=false

# Daily news curation (Claude + web search). Blank = feature disabled.
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-opus-4-8        # or claude-haiku-4-5 to cut cost

# Transactional email for double opt-in confirmations
SMTP_HOST=...
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...
DISABLE_EMAIL=false
```

Then restart the API so it picks up `TURNSTILE_SECRET` / SMTP:

```bash
sudo systemctl restart api.honoryourcommitment
```

> If your `.env` predates these keys, the lines may be missing — just add them
> (the app falls back to safe defaults for any absent key). The news job reads
> `.env` on each run, so it needs **no** restart; only the API server does.

`DATABASE_URL` and `IP_HASH_SALT` are generated automatically on first
provision — leave them as-is.

---

## 3. Redeploys (shipping new code)

Push to `main`, then **re-run the provisioner** — it pulls latest, migrates,
rebuilds the frontend, and restarts services. `.env` is preserved.

```bash
git -C www.honoryourcommitment.com push origin main
git -C api.honoryourcommitment.com push origin main
./provision-server.sh <server-host>
```

In-place alternative (on the server), if you prefer not to run the full script:

```bash
# API
sudo -u phyc git -C /opt/api.honoryourcommitment.com pull
cd /opt/api.honoryourcommitment.com \
  && sudo -u phyc -H npm ci --omit=dev \
  && sudo -u phyc -H npm run migrate
sudo systemctl restart api.honoryourcommitment

# Frontend
sudo git -C /opt/src/www.honoryourcommitment.com pull
cd /opt/src/www.honoryourcommitment.com && sudo npm ci && sudo npm run build
sudo rsync -a --delete dist/ /var/www/www.honoryourcommitment.com/
```

---

## 4. Content operations

**Daily news feed** (auto, once `ANTHROPIC_API_KEY` is set):

```bash
sudo systemctl start fetch-news                  # run now instead of waiting for the timer
journalctl -u fetch-news -n 50 --no-pager        # see what it found
systemctl list-timers fetch-news.timer           # confirm the schedule
```

**Press releases** (first-party; the Media Center section is hidden until one
exists):

```bash
cd /opt/api.honoryourcommitment.com
sudo -u phyc -H npm run add-press-release -- \
  '{"title":"...","summary":"...","date":"2026-06-12","url":"https://..."}'
```

---

## 5. Verify

```bash
curl -s https://api.honoryourcommitment.com/api/health        # {"ok":true,...}
curl -s https://api.honoryourcommitment.com/api/stats         # JSON counters
curl -s https://api.honoryourcommitment.com/api/news          # {"articles":[...]}
curl -sI https://honoryourcommitment.com/                     # 200 + valid TLS
curl -sI https://www.honoryourcommitment.com/                 # 301 → apex
```

Then load the site, submit a test petition signature, and confirm via the email
link (or, with email disabled, the link printed in `journalctl -u api.honoryourcommitment`).

---

## 6. Rollback

Revert on `main` and redeploy:

```bash
git -C api.honoryourcommitment.com revert <bad-commit> && git -C api.honoryourcommitment.com push
./provision-server.sh <server-host>
```

The provisioner's `git reset --hard origin/main` makes the server match `main`
exactly, so reverting `main` is the source of truth. Database migrations are
forward-only — a code rollback does **not** drop tables (safe, but plan schema
changes accordingly).

---

## 7. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Certbot skipped a domain | DNS for that name didn't resolve to the box yet. Point it, re-run the provisioner (or the printed `sudo certbot --nginx -d ... --redirect`). |
| Forms show "couldn't reach the server" | API not up, or DNS/TLS for `api.` not ready. Check `systemctl status api.honoryourcommitment` and `journalctl -u api.honoryourcommitment`. |
| Form submit returns a captcha error | `TURNSTILE_SECRET` missing/wrong, `DISABLE_TURNSTILE` still `true`, or the site's hostname isn't in the Turnstile widget's allowed list. |
| Browser console CORS error on submit | API `FRONTEND_URL` must be the **apex** origin (`https://honoryourcommitment.com`) — it is by default, since the site canonicalizes to the apex. |
| News section empty / stale | `ANTHROPIC_API_KEY` unset, or the last run found nothing (it keeps the prior batch). Run `sudo systemctl start fetch-news` and read its logs. |
| No confirmation emails | SMTP not configured or `DISABLE_EMAIL=true`; the confirmation link is logged to `journalctl -u api.honoryourcommitment` in that case. |
| git "dubious ownership" during deploy | Handled by the provisioner (marks repos as safe.directory). If hit manually: `git config --global --add safe.directory <path>`. |
| Locked out after SSH hardening | Password login is disabled by design. Use your SSH key as `deploy@host` (or `root@host`); recover via the Hetzner console if the key is lost. |

---

## Service & file reference

| Item | Path / name |
| --- | --- |
| API service | `systemctl … api.honoryourcommitment` |
| News timer / job | `systemctl … fetch-news.timer` / `fetch-news.service` |
| API logs | `journalctl -u api.honoryourcommitment -f` |
| Nginx vhosts | `/etc/nginx/sites-available/{honoryourcommitment.com,api.honoryourcommitment.com}`* |
| TLS certs | `/etc/letsencrypt/live/…` (auto-renewed by certbot) |
| Postgres | local-only; DB `phyc`, role `phyc` |

\* The frontend vhost file is named after the frontend domain
(`www.honoryourcommitment.com`) and contains both the apex (content) and `www`
(redirect) server blocks.
