import type { EmailAccount } from '@prisma/client';
import { GmailAdapter } from './adapters/GmailAdapter';
import { OutlookAdapter } from './adapters/OutlookAdapter';
import { ImapAdapter } from './adapters/ImapAdapter';
import { decrypt } from '@/lib/crypto';

export interface SendEmailOptions {
  from: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
}

/** A message fetched from a connected inbox (metadata only — no body). */
export interface InboxMessage {
  /** Provider's unique message ID (Gmail msg.id, Graph message.id, IMAP UID). */
  providerMessageId: string;
  fromEmail: string;
  subject: string;
  date: Date;
  /** Recipient extracted from an NDR header (X-Failed-Recipients), if present. */
  failedRecipient?: string | null;
}

export interface EmailAdapter {
  /** Send an email. Returns the provider's message ID if available (for reconciliation). */
  send(options: SendEmailOptions): Promise<string | undefined>;
  /** Fetch inbox messages received since `since`. Optional — not all adapters sync. */
  fetchMessagesSince?(since: Date): Promise<InboxMessage[]>;
}

/**
 * Provider-agnostic email abstraction.
 * Call EmailService.fromAccount(account) to get the right adapter.
 */
export class EmailService {
  private adapter: EmailAdapter;

  constructor(adapter: EmailAdapter) {
    this.adapter = adapter;
  }

  async send(options: SendEmailOptions): Promise<string | undefined> {
    return this.adapter.send(options);
  }

  /** Returns null when the underlying adapter does not support inbox sync. */
  async fetchMessagesSince(since: Date): Promise<InboxMessage[] | null> {
    if (!this.adapter.fetchMessagesSince) return null;
    return this.adapter.fetchMessagesSince(since);
  }

  static async fromAccount(account: EmailAccount): Promise<EmailService> {
    switch (account.provider) {
      case 'gmail': {
        const accessToken = account.encAccessToken
          ? await decrypt(account.encAccessToken)
          : account.accessToken;
        const refreshToken = account.encRefreshToken
          ? await decrypt(account.encRefreshToken)
          : account.refreshToken;
        return new EmailService(
          new GmailAdapter({
            accessToken: accessToken!,
            refreshToken: refreshToken!,
            tokenExpiry: account.tokenExpiry ?? undefined,
            accountId: account.id,
          })
        );
      }

      case 'outlook': {
        const accessToken = account.encAccessToken
          ? await decrypt(account.encAccessToken)
          : account.accessToken;
        const refreshToken = account.encRefreshToken
          ? await decrypt(account.encRefreshToken)
          : account.refreshToken;
        return new EmailService(
          new OutlookAdapter({
            accessToken: accessToken!,
            refreshToken: refreshToken!,
            tokenExpiry: account.tokenExpiry ?? undefined,
            accountId: account.id,
          })
        );
      }

      case 'imap_smtp':
        return new EmailService(
          new ImapAdapter({
            email: account.email,
            password: await decrypt(account.encPassword!),
            smtpServer: account.smtpServer!,
            smtpPort: account.smtpPort ?? 465,
            imapServer: account.imapServer ?? undefined,
            imapPort: account.imapPort ?? undefined,
          })
        );

      default:
        throw new Error(`Unknown email provider: ${account.provider}`);
    }
  }
}
