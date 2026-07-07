import { describe, it, expect } from 'vitest';
import { isBounceMessage, isAutoReply, extractBouncedRecipient } from '@/lib/email/bounceDetection';

describe('isBounceMessage', () => {
  it('detects mailer-daemon and postmaster senders', () => {
    expect(isBounceMessage({ fromEmail: 'mailer-daemon@googlemail.com', subject: 'anything' })).toBe(true);
    expect(isBounceMessage({ fromEmail: 'postmaster@outlook.com', subject: 'anything' })).toBe(true);
  });

  it('detects NDR subjects from normal senders', () => {
    expect(isBounceMessage({ fromEmail: 'noreply@mail.example.com', subject: 'Undeliverable: Quick intro' })).toBe(true);
    expect(isBounceMessage({ fromEmail: 'x@y.com', subject: 'Delivery Status Notification (Failure)' })).toBe(true);
    expect(isBounceMessage({ fromEmail: 'x@y.com', subject: 'Mail delivery failed: returning message to sender' })).toBe(true);
  });

  it('does not flag normal replies', () => {
    expect(isBounceMessage({ fromEmail: 'anh@vinatech.vn', subject: 'Re: Quick intro' })).toBe(false);
  });
});

describe('isAutoReply', () => {
  it('flags out-of-office and automatic replies', () => {
    expect(isAutoReply({ subject: 'Out of Office: Re: Quick intro' })).toBe(true);
    expect(isAutoReply({ subject: 'Automatic reply: Quick intro' })).toBe(true);
    expect(isAutoReply({ subject: 'Auto-Reply' })).toBe(true);
  });

  it('does not flag genuine replies', () => {
    expect(isAutoReply({ subject: 'Re: Quick intro — yes, interested' })).toBe(false);
  });
});

describe('extractBouncedRecipient', () => {
  it('prefers the X-Failed-Recipients header', () => {
    expect(
      extractBouncedRecipient({
        providerMessageId: 'msg-1',
        fromEmail: 'mailer-daemon@googlemail.com',
        subject: 'Delivery Status Notification (Failure)',
        date: new Date(),
        failedRecipient: 'Bad.Address@Example.COM',
      })
    ).toBe('bad.address@example.com');
  });

  it('falls back to an email found in the subject', () => {
    expect(
      extractBouncedRecipient({
        providerMessageId: 'msg-2',
        fromEmail: 'postmaster@x.com',
        subject: 'Undeliverable: mail to john@acme.io',
        date: new Date(),
        failedRecipient: null,
      })
    ).toBe('john@acme.io');
  });

  it('returns null when nothing is extractable', () => {
    expect(
      extractBouncedRecipient({
        providerMessageId: 'msg-3',
        fromEmail: 'postmaster@x.com',
        subject: 'Undeliverable message',
        date: new Date(),
        failedRecipient: null,
      })
    ).toBeNull();
  });
});
