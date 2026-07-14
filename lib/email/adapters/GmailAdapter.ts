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
            accessToken: null,
            encAccessToken,
            tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
            ...(tokens.refresh_token ? { refreshToken: null, encRefreshToken } : {}),
          },
        });
      }
    });

    const MailComposer = (await import('nodemailer/lib/mail-composer')).default;
    const mail = new MailComposer({
      from: options.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
      attachments: options.attachments,
    });

    const rawMessageBuffer = await mail.compile().build();
    const raw = rawMessageBuffer
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

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
            accessToken: null,
            encAccessToken,
            tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
            ...(tokens.refresh_token ? { refreshToken: null, encRefreshToken } : {}),
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

    const getGmailMessageBody = (payload: any): { body: string; bodyHtml: string } => {
      let body = '';
      let bodyHtml = '';

      const decode = (data: string) =>
        Buffer.from(data, 'base64').toString('utf-8');

      const traverseParts = (parts: any[]) => {
        for (const part of parts) {
          if (part.mimeType === 'text/plain' && part.body?.data) {
            body = decode(part.body.data);
          } else if (part.mimeType === 'text/html' && part.body?.data) {
            bodyHtml = decode(part.body.data);
          } else if (part.parts) {
            traverseParts(part.parts);
          }
        }
      };

      if (payload.parts) {
        traverseParts(payload.parts);
      } else if (payload.body?.data) {
        if (payload.mimeType === 'text/html') {
          bodyHtml = decode(payload.body.data);
        } else {
          body = decode(payload.body.data);
        }
      }

      return { body, bodyHtml };
    };

    const messages: InboxMessage[] = [];
    for (const ref of list.data.messages ?? []) {
      const msg = await gmail.users.messages.get({
        userId: 'me',
        id: ref.id!,
        format: 'full',
      });
      const headers = msg.data.payload?.headers ?? [];
      const header = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
      
      const fromRaw = header('From');
      const fromEmailMatch = fromRaw.match(/<([^>]+)>/);
      const fromEmail = (fromEmailMatch ? fromEmailMatch[1] : fromRaw).trim().toLowerCase();
      const fromNameMatch = fromRaw.match(/^([^<]+)/);
      const fromName = fromNameMatch ? fromNameMatch[1].replace(/"/g, '').trim() : null;

      const toRaw = header('To');
      const toEmailMatch = toRaw.match(/<([^>]+)>/);
      const to = (toEmailMatch ? toEmailMatch[1] : toRaw).trim().toLowerCase();

      const { body, bodyHtml } = msg.data.payload ? getGmailMessageBody(msg.data.payload) : { body: '', bodyHtml: '' };

      const labels = msg.data.labelIds ?? [];
      const isSpam = labels.includes('SPAM');
      const isTrash = labels.includes('TRASH');

      messages.push({
        providerMessageId: ref.id!,
        fromEmail,
        fromName,
        to,
        subject: header('Subject'),
        date: header('Date') ? new Date(header('Date')) : new Date(Number(msg.data.internalDate)),
        body: body || msg.data.snippet || '',
        bodyHtml: bodyHtml || body || msg.data.snippet || '',
        failedRecipient: header('X-Failed-Recipients') || null,
        isSpam,
        isTrash,
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
