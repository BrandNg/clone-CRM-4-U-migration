import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import type { EmailAdapter, InboxMessage, SendEmailOptions } from '../EmailService';

interface ImapConfig {
  email: string;
  password: string;
  smtpServer: string;
  smtpPort: number;
  imapServer?: string;
  imapPort?: number;
}

/**
 * IMAP/SMTP adapter for Roundcube and any standard mail server.
 * Uses nodemailer for sending (SMTP) and imapflow for reading (IMAP).
 */
export class ImapAdapter implements EmailAdapter {
  private config: ImapConfig;

  constructor(config: ImapConfig) {
    this.config = config;
  }

  async send(options: SendEmailOptions): Promise<string | undefined> {
    const transporter = nodemailer.createTransport({
      host: this.config.smtpServer,
      port: this.config.smtpPort,
      secure: this.config.smtpPort === 465,
      auth: {
        user: this.config.email,
        pass: this.config.password,
      },
      tls: { rejectUnauthorized: process.env.MAIL_ALLOW_SELF_SIGNED !== 'true' },
    });

    const info = await transporter.sendMail({
      from: options.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
    });
    return info.messageId;
  }

  /** Fetch inbox messages received since `since` via IMAP (envelopes only). */
  async fetchMessagesSince(since: Date): Promise<InboxMessage[]> {
    if (!this.config.imapServer) return [];

    const client = new ImapFlow({
      host: this.config.imapServer,
      port: this.config.imapPort ?? 993,
      secure: (this.config.imapPort ?? 993) === 993,
      auth: { user: this.config.email, pass: this.config.password },
      socketTimeout: 30_000,
      logger: false,
      tls: { rejectUnauthorized: process.env.MAIL_ALLOW_SELF_SIGNED !== 'true' },
    });

    await client.connect();
    const messages: InboxMessage[] = [];
    try {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const uids = ((await client.search({ since })) || []) as number[];
        // Cap per run; newest last in UID order, keep the most recent 50
        const recent = uids.slice(-50);
        if (recent.length > 0) {
          for await (const msg of client.fetch(recent, { envelope: true })) {
            const from = msg.envelope?.from?.[0];
            messages.push({
              providerMessageId: String(msg.uid),
              fromEmail: (from?.address ?? '').toLowerCase(),
              subject: msg.envelope?.subject ?? '',
              date: msg.envelope?.date ?? new Date(),
              failedRecipient: null,
            });
          }
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => {});
    }
    return messages;
  }

  /** Verify the SMTP connection credentials. Returns true if valid. */
  async verify(): Promise<boolean> {
    try {
      const transporter = nodemailer.createTransport({
        host: this.config.smtpServer,
        port: this.config.smtpPort,
        secure: this.config.smtpPort === 465,
        auth: { user: this.config.email, pass: this.config.password },
        tls: { rejectUnauthorized: process.env.MAIL_ALLOW_SELF_SIGNED !== 'true' },
      });
      await transporter.verify();
      return true;
    } catch {
      return false;
    }
  }
}

/** Verify IMAP/SMTP credentials before saving to DB. */
export async function verifyImapCredentials(config: ImapConfig): Promise<boolean> {
  const adapter = new ImapAdapter(config);
  return adapter.verify();
}
