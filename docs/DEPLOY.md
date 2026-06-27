# Deploy Runbook — Telestar SDR CRM

Production deployment to an **always-on host** (e.g. AWS EC2) with **managed Postgres**
(RDS) and **managed Redis** (ElastiCache / Upstash). The app is DB- and host-agnostic —
no Neon or Vercel coupling.

> Runtime law: API routes record intent · workers execute it · the database is truth.
> The web app and the BullMQ worker are **two processes** on the host (or two hosts).

---

## 1. Architecture at a glance

| Process | Command | Needs |
|---------|---------|-------|
| **Web** (Next.js) | `npm run start` (after `npm run build`) | `DATABASE_URL`, `AUTH_SECRET`, `ENCRYPTION_KEY` |
| **Worker** (BullMQ) | `npm run worker:start` | `DATABASE_URL` (use `DIRECT_URL`/TCP for atomic work), `REDIS_URL` |
| **Scheduler** (host cron / PM2) | `curl` the `/api/cron/*` routes | `CRON_SECRET` |

Redis is **required for the worker**; the web app uses it as an optional cache and
degrades gracefully if it is unreachable.

---

## 2. Prerequisites

- A managed **PostgreSQL 16** instance (RDS). Create a database `telestar_crm`.
- A managed **Redis** instance reachable from the host.
- An always-on **Node 24+** host with a process manager (PM2 recommended).
- DNS + TLS terminating at a load balancer / reverse proxy in front of the web process
  (the security headers in `next.config.ts` — including HSTS — assume HTTPS at the edge).

---

## 3. Generate production secrets

Generate **fresh** values — never reuse dev/seed values:

```bash
# AUTH_SECRET (NextAuth session signing)
openssl rand -base64 32

# ENCRYPTION_KEY (AES-256 for stored email credentials/tokens) — must be 64 hex chars
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# CRON_SECRET (bearer token the scheduler sends to /api/cron/*)
openssl rand -hex 32
```

Set these plus the connection strings in the host environment (or a secrets manager).
See [`.env.example`](../.env.example) for the full list. Required to boot:
`DATABASE_URL`, `AUTH_SECRET`, `ENCRYPTION_KEY` — boot **fails fast** if any is missing
(`lib/env.ts` + `instrumentation.ts`). Also set `NEXTAUTH_URL` to the public HTTPS URL,
and point any OAuth redirect URIs (Google/Microsoft) at the production domain.

---

## 4. Database migration + first admin

```bash
npm ci
npx prisma migrate deploy          # applies migrations to RDS (uses DIRECT_URL)
```

**Do NOT run `npm run db:seed` in production** — it wipes data and creates demo users that
share the password `telestar2026`. Create the first Director instead:

```bash
npm run create-admin -- --email you@yourdomain.com --password 'a-strong-password' --name 'Your Name'
# or via ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME env vars
```

This creates the `default-tenant` row if missing and a `director` user (idempotent: re-running
resets that user's password and ensures the account is active). Additional users are then
created from inside the app (Settings → user management).

---

## 5. Build + run the web process

```bash
npm run build                      # prisma generate && next build
npm run start                      # serves on PORT (default 3000)
```

Under PM2:

```bash
pm2 start npm --name crm-web -- run start
```

The login page's demo-account panel is compiled out when `NODE_ENV=production` — verify it
is **absent** on the live login page.

---

## 6. Run the worker process

The worker runs sequence sends, inbox sync, and maintenance jobs off the BullMQ queue. It
must have `REDIS_URL` and a database URL (prefer a TCP `DIRECT_URL` so multi-step atomic
jobs work — the HTTP/pooled path has no interactive transactions).

```bash
pm2 start npm --name crm-worker -- run worker:start
npm run worker:healthcheck         # enqueues a health job to confirm the pipeline
```

---

## 7. Schedule the crons

Point the host scheduler (PM2 cron module or OS `crontab`) at the cron routes with the
`CRON_SECRET` bearer. Suggested cadence:

```cron
# sequence engine — advances due sequence steps / enqueues sends (every 5 min)
*/5 * * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://crm.yourdomain.com/api/cron/sequence-engine
# inbox sync — pulls replies/bounces for connected mailboxes (every 10 min)
*/10 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://crm.yourdomain.com/api/cron/inbox-sync
```

---

## 8. Go-live checklist

- [ ] `npx prisma migrate deploy` applied cleanly against RDS.
- [ ] `create-admin` Director can log in over HTTPS.
- [ ] Login page shows **no** demo-account panel.
- [ ] `GET /api/health` returns OK.
- [ ] Worker process up; `worker:healthcheck` job completes.
- [ ] Both crons firing (check logs for 200s).
- [ ] Security headers present (`curl -I` shows HSTS, `X-Frame-Options: DENY`, `nosniff`).
- [ ] Email sending decision made: `SEQUENCE_AUTOSEND_ENABLED` (`false` keeps unattended
      sends off until you're ready to go live).

---

## 9. Open decisions / notes

- **Automated sequence sends run on BullMQ.** When a sequence creates an automated email
  step, `lib/sequences/engine.ts` enqueues a **delayed** `sequence.execute-task` job (due at
  the step's send time) that the worker runs — render → `OutboundMessage` → `email.send`.
  The delayed job is mirrored in the `JobRun` table, so it survives a worker restart and the
  maintenance worker's `missing-delayed` repair can rebuild it. No Inngest account or keys are
  required (the dependency was removed). Workers + `REDIS_URL` are therefore mandatory for
  unattended sends; keep `SEQUENCE_AUTOSEND_ENABLED=false` until you're ready to go live.
- **CSP** is intentionally not yet set in `next.config.ts` (a strict nonce-based policy needs
  per-request nonce wiring and would otherwise break inline styles). Add it at the edge/proxy
  or in a follow-up once nonces are wired.
- **Row-Level Security**: app-layer tenant scoping is the isolation layer. To additionally
  enforce Postgres RLS, apply `supabase/rls.sql` and set `DB_RLS_ENFORCED=true`.
