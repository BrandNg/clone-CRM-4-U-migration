import { google } from 'googleapis';
import type { EmailAdapter, InboxMessage, SendEmailOptions } from '../EmailService';
import { encrypt } from '@/lib/crypto';

interface GmailConfig {
  accessToken: string;
  refreshToken: string;
  tokenExpiry?: Date;
  /** EmailAccount.id — used to persist refreshed tokens back to the DB. */
  accountId?: string;
}

/**
 * Gmail adapter using the Gmail API via OAuth 2.0.
 * Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in env.
 */
export class GmailAdapter implements EmailAdapter {
  private config: GmailConfig;

  constructor(config: GmailConfig) {
    this.config = config;
  }

  async send(options: SendEmailOptions): Promise<string | undefined> {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      access_token: this.config.accessToken,
      refresh_token: this.config.refreshToken,
      expiry_date: this.config.tokenExpiry?.getTime(),
    });

    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token && this.config.accountId) {
        const { prisma } = await import('@/lib/prisma');
        const [encAccessToken, encRefreshToken] = await Promise.all([
          encrypt(tokens.access_token),
          tokens.refresh_token ? encrypt(tokens.refresh_token) : Promise.resolve(undefined),
        ]);
        await prisma.emailAccount.update({
          where: { id: this.config.accountId },
          data: {
            accessToken: tokens.access_token,
            encAccessToken,
            tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
            ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token, encRefreshToken } : {}),
          },
        });
      }
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const messageParts = [
      `From: ${options.from}`,
      `To: ${options.to}`,
      ...(options.replyTo ? [`Reply-To: ${options.replyTo}`] : []),
      `Subject: ${options.subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      '',
      options.html ?? options.text ?? '',
    ];

    const raw = Buffer.from(messageParts.join('\r\n'))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const msg = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });
    return msg.data.id ?? undefined;
  }

  /** Fetch inbox messages received since `since` (metadata only). */
  async fetchMessagesSince(since: Date): Promise<InboxMessage[]> {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    oauth2Client.setCredentials({
      access_token: this.config.accessToken,
      refresh_token: this.config.refreshToken,
      expiry_date: this.config.tokenExpiry?.getTime(),
    });

    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token && this.config.accountId) {
        const { prisma } = await import('@/lib/prisma');
        const [encAccessToken, encRefreshToken] = await Promise.all([
          encrypt(tokens.access_token),
          tokens.refresh_token ? encrypt(tokens.refresh_token) : Promise.resolve(undefined),
        ]);
        await prisma.emailAccount.update({
          where: { id: this.config.accountId },
          data: {
            accessToken: tokens.access_token,
            encAccessToken,
            tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
            ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token, encRefreshToken } : {}),
          },
        });
      }
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const list = await gmail.users.messages.list({
      userId: 'me',
      q: `in:inbox after:${Math.floor(since.getTime() / 1000)}`,
      maxResults: 50,
    });

    const messages: InboxMessage[] = [];
    for (const ref of list.data.messages ?? []) {
      const msg = await gmail.users.messages.get({
        userId: 'me',
        id: ref.id!,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date', 'X-Failed-Recipients'],
      });
      const headers = msg.data.payload?.headers ?? [];
      const header = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
      const fromRaw = header('From');
      const emailMatch = fromRaw.match(/<([^>]+)>/);
      messages.push({
        providerMessageId: ref.id!,
        fromEmail: (emailMatch ? emailMatch[1] : fromRaw).trim().toLowerCase(),
        subject: header('Subject'),
        date: header('Date') ? new Date(header('Date')) : new Date(Number(msg.data.internalDate)),
        failedRecipient: header('X-Failed-Recipients') || null,
      });
    }
    return messages;
  }
}

/**
 * Exchange a Google authorization code for OAuth tokens.
 * Called from the OAuth callback route.
 */
export async function exchangeGoogleCode(code: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  const { tokens } = await oauth2Client.getToken(code);

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  oauth2Client.setCredentials(tokens);
  const profile = await gmail.users.getProfile({ userId: 'me' });

  if (!tokens.access_token) {
    throw new Error('Google did not return an access token');
  }

  return {
    email: profile.data.emailAddress!,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
  };
}

/** Build the Google OAuth authorization URL for connecting a Gmail account. */
export function getGoogleAuthUrl(state?: string): string {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    prompt: 'consent',
    state,
  });
}
