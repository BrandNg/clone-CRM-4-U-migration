import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { EmailSendPayload } from '@/lib/bullmq/types';

const mockOutboundFindUnique = vi.fn();
const mockOutboundUpdate = vi.fn();
const mockSuppressionFindFirst = vi.fn();
const mockAccountFindUnique = vi.fn();
const mockLeadFindUnique = vi.fn();
const mockLeadUpdate = vi.fn();
const mockActivityCreate = vi.fn();
const mockExecuteRaw = vi.fn();
const mockServiceSend = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    outboundMessage: {
      findUnique: (...args: unknown[]) => mockOutboundFindUnique(...args),
      update: (...args: unknown[]) => mockOutboundUpdate(...args),
    },
    suppressionEntry: {
      findFirst: (...args: unknown[]) => mockSuppressionFindFirst(...args),
    },
    emailAccount: {
      findUnique: (...args: unknown[]) => mockAccountFindUnique(...args),
    },
    lead: {
      findUnique: (...args: unknown[]) => mockLeadFindUnique(...args),
      update: (...args: unknown[]) => mockLeadUpdate(...args),
    },
    activity: {
      create: (...args: unknown[]) => mockActivityCreate(...args),
    },
    $executeRaw: (...args: unknown[]) => mockExecuteRaw(...args),
  },
}));

vi.mock('@/lib/email/EmailService', () => ({
  EmailService: {
    fromAccount: vi.fn().mockResolvedValue({
      send: (...args: unknown[]) => mockServiceSend(...args),
    }),
  },
}));

vi.mock('@/lib/templates/render', () => ({
  renderTemplate: vi.fn((val: string) => val),
}));

vi.mock('@/lib/tenant-context', () => ({
  tenantStorage: {
    run: (_: unknown, fn: () => unknown) => fn(),
  },
}));

const { handleEmailSend } = await import('@/workers/email');

const TENANT_ID = 'default-tenant';

function mockOutboundMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-1',
    leadId: 'lead-1',
    accountId: 'acc-1',
    to: 'test@example.com',
    subject: 'Hello',
    body: 'World',
    status: 'pending',
    providerMessageId: null,
    tenantId: TENANT_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
    lead: { campaignId: 'camp-1', assignedToId: 'user-1' },
    ...overrides,
  };
}

function buildPayload(overrides: Partial<EmailSendPayload> = {}): EmailSendPayload {
  return {
    outboundMessageId: 'msg-1',
    accountId: 'acc-1',
    to: 'test@example.com',
    subject: 'Hello',
    body: 'World',
    leadId: 'lead-1',
    templateId: 'tpl-1',
    ...overrides,
  };
}

describe('handleEmailSend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends email and updates outbound message to sent', async () => {
    const payload = buildPayload();
    mockOutboundFindUnique.mockResolvedValueOnce(mockOutboundMessage());
    mockSuppressionFindFirst.mockResolvedValueOnce(null);
    mockExecuteRaw.mockResolvedValueOnce(1);
    mockAccountFindUnique.mockResolvedValueOnce({ id: 'acc-1', email: 'sender@example.com' });
    mockServiceSend.mockResolvedValueOnce('provider-msg-id-123');

    const result = await handleEmailSend(payload);

    expect(result).toEqual({ success: true, outboundMessageId: 'msg-1', providerMessageId: 'provider-msg-id-123' });

    expect(mockOutboundUpdate).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: { status: 'sending' },
    });
    expect(mockOutboundUpdate).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: { status: 'sent', providerMessageId: 'provider-msg-id-123', sentAt: expect.any(Date) },
    });
    expect(mockActivityCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        leadId: 'lead-1',
        type: 'email_sent',
        userId: 'user-1',
      }),
    });
    expect(mockLeadUpdate).toHaveBeenCalledWith({
      where: { id: 'lead-1' },
      data: { lastContactedAt: expect.any(Date) },
    });
  });

  it('skips if already sent with providerMessageId', async () => {
    mockOutboundFindUnique.mockResolvedValueOnce(
      mockOutboundMessage({ status: 'sent', providerMessageId: 'abc-123' })
    );

    const result = await handleEmailSend(buildPayload());

    expect(result).toEqual({ skipped: true, reason: 'already_sent', providerMessageId: 'abc-123' });
    expect(mockServiceSend).not.toHaveBeenCalled();
  });

  it('skips if sending with providerMessageId (reconciliation)', async () => {
    mockOutboundFindUnique.mockResolvedValueOnce(
      mockOutboundMessage({ status: 'sending', providerMessageId: 'abc-123' })
    );

    const result = await handleEmailSend(buildPayload());

    expect(result).toEqual({ skipped: true, reason: 'already_sent_provider_reconcile', providerMessageId: 'abc-123' });
    expect(mockServiceSend).not.toHaveBeenCalled();
  });

  it('skips if recipient is suppressed', async () => {
    mockOutboundFindUnique.mockResolvedValueOnce(mockOutboundMessage());
    mockSuppressionFindFirst.mockResolvedValueOnce({ reason: 'unsubscribed', email: 'test@example.com' });

    const result = await handleEmailSend(buildPayload());

    expect(result).toEqual({ skipped: true, reason: 'suppressed' });
    expect(mockServiceSend).not.toHaveBeenCalled();
    expect(mockOutboundUpdate).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: { status: 'failed', errorMessage: 'Recipient suppressed: unsubscribed' },
    });
  });

  it('skips if quota exhausted', async () => {
    mockOutboundFindUnique.mockResolvedValueOnce(mockOutboundMessage());
    mockSuppressionFindFirst.mockResolvedValueOnce(null);
    mockExecuteRaw.mockResolvedValueOnce(0);

    const result = await handleEmailSend(buildPayload());

    expect(result).toEqual({ skipped: true, reason: 'quota_exhausted' });
    expect(mockServiceSend).not.toHaveBeenCalled();
    expect(mockOutboundUpdate).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: { status: 'failed', errorMessage: 'Daily send limit reached' },
    });
  });

  it('sends without leadId if payload omits it', async () => {
    mockOutboundFindUnique.mockResolvedValueOnce(mockOutboundMessage({ lead: { campaignId: null, assignedToId: 'system' } }));
    mockSuppressionFindFirst.mockResolvedValueOnce(null);
    mockExecuteRaw.mockResolvedValueOnce(1);
    mockAccountFindUnique.mockResolvedValueOnce({ id: 'acc-1', email: 'sender@example.com' });
    mockServiceSend.mockResolvedValueOnce(undefined);

    const result = await handleEmailSend(buildPayload({ leadId: undefined }));

    expect(result).toEqual({ success: true, outboundMessageId: 'msg-1', providerMessageId: undefined });
    expect(mockActivityCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'system' }),
    });
  });

  it('throws and marks failed on send error', async () => {
    mockOutboundFindUnique.mockResolvedValueOnce(mockOutboundMessage());
    mockSuppressionFindFirst.mockResolvedValueOnce(null);
    mockExecuteRaw.mockResolvedValueOnce(1);
    mockAccountFindUnique.mockResolvedValueOnce({ id: 'acc-1', email: 'sender@example.com' });
    mockServiceSend.mockRejectedValueOnce(new Error('SMTP connection refused'));

    await expect(handleEmailSend(buildPayload())).rejects.toThrow('SMTP connection refused');

    const failedUpdate = mockOutboundUpdate.mock.calls.find(
      (args: any[]) => args[0]?.data?.status === 'failed'
    );
    expect(failedUpdate).toBeDefined();
    expect(failedUpdate![0].data.errorMessage).toBe('SMTP connection refused');
  });
});
