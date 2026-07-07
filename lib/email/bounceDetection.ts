/**
 * Pure classifiers for inbox-sync messages. Heuristic by design — NDR formats
 * vary by mail server, so we match the common senders and subject lines.
 */

import type { InboxMessage } from './EmailService';

const BOUNCE_SENDER_RE = /^(mailer-daemon|postmaster|mail delivery (subsystem|system))@/i;

const BOUNCE_SUBJECT_RE =
  /undeliverable|undelivered mail|delivery (status notification|has failed|failure)|returned mail|failure notice|mail delivery failed|delivery incomplete/i;

const AUTO_REPLY_SUBJECT_RE =
  /out of (the )?office|auto.?reply|automatic reply|autorespond|away from (the )?office|on vacation|annual leave/i;

export function isBounceMessage(msg: Pick<InboxMessage, 'fromEmail' | 'subject'>): boolean {
  return BOUNCE_SENDER_RE.test(msg.fromEmail) || BOUNCE_SUBJECT_RE.test(msg.subject ?? '');
}

/** Out-of-office / auto-replies must not count as real replies. */
export function isAutoReply(msg: Pick<InboxMessage, 'subject'>): boolean {
  return AUTO_REPLY_SUBJECT_RE.test(msg.subject ?? '');
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

/**
 * Best-effort extraction of the address that bounced: prefer the
 * X-Failed-Recipients header, else the first email found in the subject.
 */
export function extractBouncedRecipient(msg: InboxMessage): string | null {
  if (msg.failedRecipient) {
    const match = msg.failedRecipient.match(EMAIL_RE);
    if (match) return match[0].toLowerCase();
  }
  const subjectMatch = (msg.subject ?? '').match(EMAIL_RE);
  return subjectMatch ? subjectMatch[0].toLowerCase() : null;
}
