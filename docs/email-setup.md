# Email Setup — Telestar SDR CRM

The CRM sends and syncs email through a provider-agnostic layer (`lib/email/EmailService.ts`)
with three adapters: **Gmail** (OAuth, Gmail API), **Outlook** (OAuth, Microsoft Graph), and
**IMAP/SMTP** (Roundcube or any mail server). The code is complete — this guide covers the
one-time credential setup each provider needs. SDRs connect their own mailbox under
**Settings → Email Accounts**.

Until an account is connected, the app degrades gracefully: phone / LinkedIn / WhatsApp / notes /
tasks all work, and the lead "Email" action falls back to your OS mail app.

---

## Common: encryption key (required for IMAP, recommended always)

IMAP/SMTP passwords are encrypted at rest. Generate a 32-byte key and set it in `.env.local`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```
ENCRYPTION_KEY="<64-hex-characters>"
```

> Redirect URIs below use `http://localhost:3000` for local dev. In production, replace the host
> with your deployed domain (the value of `NEXTAUTH_URL`), e.g.
> `https://your-app.vercel.app/api/email/oauth/google/callback`. Register **both** if you test locally.

---

## Gmail (Google OAuth)

1. Google Cloud Console → create/select a project → **APIs & Services**.
2. **Enable the Gmail API** (Library → "Gmail API" → Enable).
3. **OAuth consent screen**: External, add your team's emails as test users (or publish).
4. **Credentials → Create credentials → OAuth client ID → Web application.**
   - Authorized redirect URI: `http://localhost:3000/api/email/oauth/google/callback`
5. Copy the client ID + secret into `.env.local`:

```
GOOGLE_CLIENT_ID="xxxx.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="xxxx"
GOOGLE_REDIRECT_URI="http://localhost:3000/api/email/oauth/google/callback"
```

Scopes requested: send + read Gmail (`gmail.send`, `gmail.readonly`) — enough for outbound + reply/
bounce sync. Restart the app, then Settings → **Connect Gmail**.

---

## Outlook / Microsoft 365 (Microsoft Graph)

1. Azure Portal → **Microsoft Entra ID** → **App registrations** → **New registration**.
   - Redirect URI (Web): `http://localhost:3000/api/email/oauth/microsoft/callback`
2. **Certificates & secrets** → new client secret → copy the value.
3. **API permissions** → Microsoft Graph → Delegated:
   `Mail.Send`, `Mail.Read`, `User.Read`, `offline_access` → grant admin consent if required.
4. Set in `.env.local`:

```
MICROSOFT_CLIENT_ID="xxxx"
MICROSOFT_CLIENT_SECRET="xxxx"
MICROSOFT_REDIRECT_URI="http://localhost:3000/api/email/oauth/microsoft/callback"
```

Restart the app, then Settings → **Connect Outlook**.

---

## IMAP / SMTP (Roundcube or any mail server) — no OAuth

No app registration needed. Just make sure `ENCRYPTION_KEY` is set (above), then in
Settings → **Connect Roundcube (IMAP)** enter:

- Email address + password
- SMTP server + port (e.g. `mail.example.com`, `465` for SSL)
- IMAP server + port (e.g. `mail.example.com`, `993`) — only needed for reply/bounce sync

The CRM validates the connection on save (test send/fetch), sends via SMTP (`nodemailer`), and reads
the inbox via IMAP for reply/bounce detection.

---

## What runs once connected

- **Manual send** — the lead slide-over "Email" action opens the in-app composer → `POST /api/email/send`
  (renders template merge fields, sends, logs an `email_sent` activity, updates `lastContactedAt`).
- **Sequence auto-send** — the `sequence-engine` cron sends due email steps for enrolled leads. Toggle
  with `SEQUENCE_AUTOSEND_ENABLED` ("false" disables unattended sending).
- **Inbox sync** — the `inbox-sync` cron fetches recent messages to detect replies and bounces
  (`lib/email/bounceDetection.ts`).

> Note: the AI assistant never sends mail on its own — humans own every live conversation.
