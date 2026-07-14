# Email Setup - Telestar SDR CRM

The CRM sends and syncs email through `lib/email/EmailService.ts` with three adapters:
Gmail OAuth, Outlook/Microsoft Graph OAuth, and IMAP/SMTP. SDRs connect their own mailbox
from Settings -> Email Accounts.

Until an account is connected, the rest of the CRM still works. Email send and inbox sync
require a connected active mailbox for the SDR.

## Common Prep

Set a 32-byte encryption key before connecting any mailbox:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```env
ENCRYPTION_KEY="<64-hex-characters>"
```

Register redirect URIs for every host you use:

- Local Gmail: `http://localhost:3000/api/email/oauth/google/callback`
- Local Outlook: `http://localhost:3000/api/email/oauth/microsoft/callback`
- Production Gmail: `https://<your-domain>/api/email/oauth/google/callback`
- Production Outlook: `https://<your-domain>/api/email/oauth/microsoft/callback`

The exact URI in Google Cloud or Microsoft Entra must match the corresponding env var.
After changing env vars, restart the web app. Production worker hosts that send or sync mail
must also receive the same provider credentials and `ENCRYPTION_KEY`.

## Gmail

1. In Google Cloud Console, create or select a project.
2. Enable the Gmail API.
3. Configure the OAuth consent screen and add test users if the app is not published.
4. Create an OAuth Client ID with type Web application.
5. Add the local and production Gmail redirect URIs listed above.
6. Set:

```env
GOOGLE_CLIENT_ID="xxxx.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="xxxx"
GOOGLE_REDIRECT_URI="http://localhost:3000/api/email/oauth/google/callback"
```

The app requests `gmail.send`, `gmail.readonly`, and `userinfo.email` with offline access so
it can send, sync replies/bounces, and refresh tokens.

## Outlook / Microsoft 365

1. In Microsoft Entra ID, create an App registration.
2. Add a Web redirect URI for local and production.
3. Create a client secret and copy the secret value.
4. Add delegated Microsoft Graph permissions:
   `Mail.Send`, `Mail.Read`, `User.Read`, and `offline_access`.
5. Grant admin consent if your tenant requires it.
6. Set:

```env
MICROSOFT_CLIENT_ID="xxxx"
MICROSOFT_CLIENT_SECRET="xxxx"
MICROSOFT_REDIRECT_URI="http://localhost:3000/api/email/oauth/microsoft/callback"
```

## IMAP / SMTP

No OAuth app registration is needed. In Settings -> Connect Roundcube (IMAP), enter:

- Email address and password
- SMTP server and port, usually `465` for SSL
- IMAP server and port, usually `993` for SSL

The CRM validates credentials before saving and encrypts the password at rest.

## Runtime After Connection

- Manual sends create an `OutboundMessage` and enqueue `email.send`.
- Sequence auto-send creates delayed BullMQ jobs through the sequence engine and is executed by
  the always-on worker.
- Inbox sync runs through BullMQ sync jobs and uses provider inbox APIs or IMAP to detect replies
  and bounces.
- Live unattended sending remains controlled separately by deployment/runtime flags. Account
  linking can be enabled before live-send is enabled.

## Troubleshooting

- Provider says not configured: check the missing env vars returned by Settings and restart the app.
- Invalid redirect URI: make the provider console URI exactly match `GOOGLE_REDIRECT_URI` or
  `MICROSOFT_REDIRECT_URI`, including protocol and path.
- OAuth state mismatch: start the connect flow again from Settings; nonce cookies expire after
  10 minutes and can be lost across host/domain changes.
- Gmail missing refresh token: remove the app grant from the Google account security page, then
  reconnect so Google shows the consent screen again.
- Microsoft missing refresh token: confirm `offline_access` is granted and reconnect.
- Connected before inbox sync scopes were added: disconnect and reconnect the account.
