import { vi, describe, it, expect, beforeEach } from 'vitest';

// --- Prisma mocks ---
const mockLeadFindUnique = vi.fn();
const mockLeadFindFirst = vi.fn();
const mockLeadFindMany = vi.fn();
const mockLeadUpdate = vi.fn();
const mockAccountFindUnique = vi.fn();
const mockAccountUpdate = vi.fn();
const mockNotificationCreate = vi.fn();
const mockActivityCreate = vi.fn();
const mockTaskCreate = vi.fn();
const mockSuppressionFindFirst = vi.fn();
const mockSuppressionCreate = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    lead: {
      findUnique: (...args: unknown[]) => mockLeadFindUnique(...args),
      findFirst: (...args: unknown[]) => mockLeadFindFirst(...args),
      findMany: (...args: unknown[]) => mockLeadFindMany(...args),
      update: (...args: unknown[]) => mockLeadUpdate(...args),
    },
    emailAccount: {
      findUnique: (...args: unknown[]) => mockAccountFindUnique(...args),
      update: (...args: unknown[]) => mockAccountUpdate(...args),
    },
    notification: {
      create: (...args: unknown[]) => mockNotificationCreate(...args),
    },
    activity: {
      create: (...args: unknown[]) => mockActivityCreate(...args),
    },
    task: {
      create: (...args: unknown[]) => mockTaskCreate(...args),
    },
    suppressionEntry: {
      findFirst: (...args: unknown[]) => mockSuppressionFindFirst(...args),
      create: (...args: unknown[]) => mockSuppressionCreate(...args),
    },
  },
}));

vi.mock('@/lib/email/EmailService', () => ({
  EmailService: {
    fromAccount: vi.fn(),
  },
}));

vi.mock('@/lib/sequences/engine', () => ({
  pauseSequence: vi.fn(),
}));

vi.mock('@/lib/email/bounceDetection', () => ({
  isBounceMessage: vi.fn(),
  isAutoReply: vi.fn(),
  extractBouncedRecipient: vi.fn(),
}));

vi.mock('@/lib/tenant-context', () => ({
  tenantStorage: {
    run: (_: unknown, fn: () => unknown) => fn(),
  },
}));

const { handleApplyReply, handleApplyBounce, handleEmailSync } = await import('@/workers/sync');
const { pauseSequence } = await import('@/lib/sequences/engine');
const { isBounceMessage, isAutoReply, extractBouncedRecipient } = await import('@/lib/email/bounceDetection');
const { EmailService } = await import('@/lib/email/EmailService');

describe('handleApplyReply', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const baseLead = {
    id: 'lead-1', stage: 'contacted', sequenceStatus: 'active',
    assignedToId: 'user-1', firstName: 'John', lastName: 'Doe', company: 'Acme',
  };

  it('pauses sequence, creates activity, task, and notification for a reply', async () => {
    mockLeadFindUnique.mockResolvedValue(baseLead);

    const result = await handleApplyReply({ providerMessageId: 'msg-1', leadId: 'lead-1', accountId: 'acct-1' });

    expect(result).toEqual({ success: true, leadId: 'lead-1', providerMessageId: 'msg-1' });
    expect(mockLeadUpdate).toHaveBeenCalledWith({
      where: { id: 'lead-1' },
      data: { stage: 'replied' },
    });
    expect(pauseSequence).toHaveBeenCalledWith('lead-1', 'replied', 'user-1');
    expect(mockActivityCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        leadId: 'lead-1', type: 'stage_changed', channel: 'email',
        metadata: expect.objectContaining({ to: 'replied', providerMessageId: 'msg-1' }),
      }),
    });
    expect(mockTaskCreate).toHaveBeenCalled();
    expect(mockNotificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user-1', type: 'lead_replied' }),
    });
  });

  it('skips if lead not found', async () => {
    mockLeadFindUnique.mockResolvedValue(null);

    const result = await handleApplyReply({ providerMessageId: 'msg-1', leadId: 'lead-1', accountId: 'acct-1' });

    expect(result).toEqual({ skipped: true, reason: 'lead_not_found' });
    expect(mockLeadUpdate).not.toHaveBeenCalled();
    expect(pauseSequence).not.toHaveBeenCalled();
  });

  it('skips if lead already replied', async () => {
    mockLeadFindUnique.mockResolvedValue({ ...baseLead, stage: 'replied' });

    const result = await handleApplyReply({ providerMessageId: 'msg-1', leadId: 'lead-1', accountId: 'acct-1' });

    expect(result).toEqual({ skipped: true, reason: 'already_replied' });
    expect(mockLeadUpdate).not.toHaveBeenCalled();
  });

  it('skips if sequence is paused', async () => {
    mockLeadFindUnique.mockResolvedValue({ ...baseLead, sequenceStatus: 'paused' });

    const result = await handleApplyReply({ providerMessageId: 'msg-1', leadId: 'lead-1', accountId: 'acct-1' });

    expect(result).toEqual({ skipped: true, reason: 'sequence_not_active' });
    expect(mockLeadUpdate).not.toHaveBeenCalled();
  });

  it('skips if sequence is null', async () => {
    mockLeadFindUnique.mockResolvedValue({ ...baseLead, sequenceStatus: null });

    const result = await handleApplyReply({ providerMessageId: 'msg-1', leadId: 'lead-1', accountId: 'acct-1' });

    expect(result).toEqual({ skipped: true, reason: 'sequence_not_active' });
    expect(mockLeadUpdate).not.toHaveBeenCalled();
  });
});

describe('handleApplyBounce', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const baseLead = {
    id: 'lead-1', email: 'john@acme.com', firstName: 'John', lastName: 'Doe',
    company: 'Acme', sequenceId: 'seq-1', assignedToId: 'user-1',
    tags: [], emailInvalid: false, tenantId: 'tenant-1',
  };

  it('hard bounce: marks emailInvalid, creates SuppressionEntry, pauses sequence', async () => {
    mockLeadFindUnique.mockResolvedValue(baseLead);
    mockSuppressionFindFirst.mockResolvedValue(null);
    mockAccountFindUnique.mockResolvedValue({ tenantId: 'tenant-1' });

    const result = await handleApplyBounce({
      providerMessageId: 'msg-1', leadId: 'lead-1', accountId: 'acct-1', bounceType: 'hard',
    });

    expect(result).toEqual({ success: true, leadId: 'lead-1', bounceType: 'hard', providerMessageId: 'msg-1' });
    expect(mockLeadUpdate).toHaveBeenCalledWith({
      where: { id: 'lead-1' },
      data: { emailInvalid: true, tags: { push: 'invalid-email' } },
    });
    expect(mockSuppressionCreate).toHaveBeenCalledWith({
      data: { email: 'john@acme.com', reason: 'hard_bounce', tenantId: 'tenant-1' },
    });
    expect(pauseSequence).toHaveBeenCalledWith('lead-1', 'bounced', 'user-1');
    expect(mockNotificationCreate).toHaveBeenCalled();
  });

  it('soft bounce: does not mark emailInvalid or create SuppressionEntry', async () => {
    mockLeadFindUnique.mockResolvedValue(baseLead);

    const result = await handleApplyBounce({
      providerMessageId: 'msg-1', leadId: 'lead-1', accountId: 'acct-1', bounceType: 'soft',
    });

    expect(result).toEqual({ success: true, leadId: 'lead-1', bounceType: 'soft', providerMessageId: 'msg-1' });
    expect(mockLeadUpdate).not.toHaveBeenCalled();
    expect(mockSuppressionCreate).not.toHaveBeenCalled();
    expect(pauseSequence).toHaveBeenCalled();
    expect(mockNotificationCreate).toHaveBeenCalled();
  });

  it('skips if lead not found', async () => {
    mockLeadFindUnique.mockResolvedValue(null);

    const result = await handleApplyBounce({
      providerMessageId: 'msg-1', leadId: 'lead-1', accountId: 'acct-1', bounceType: 'hard',
    });

    expect(result).toEqual({ skipped: true, reason: 'lead_not_found' });
    expect(mockLeadUpdate).not.toHaveBeenCalled();
  });

  it('skips if lead already has emailInvalid', async () => {
    mockLeadFindUnique.mockResolvedValue({ ...baseLead, emailInvalid: true });

    const result = await handleApplyBounce({
      providerMessageId: 'msg-1', leadId: 'lead-1', accountId: 'acct-1', bounceType: 'hard',
    });

    expect(result).toEqual({ skipped: true, reason: 'already_invalid' });
    expect(mockLeadUpdate).not.toHaveBeenCalled();
  });

  it('does not create duplicate SuppressionEntry if one already exists', async () => {
    mockLeadFindUnique.mockResolvedValue(baseLead);
    mockSuppressionFindFirst.mockResolvedValue({ id: 'existing-sup' });

    const result = await handleApplyBounce({
      providerMessageId: 'msg-1', leadId: 'lead-1', accountId: 'acct-1', bounceType: 'hard',
    });

    expect(result.success).toBe(true);
    expect(mockSuppressionCreate).not.toHaveBeenCalled();
  });
});

describe('handleEmailSync', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const mockAccount = {
    id: 'acct-1', isActive: true, userId: 'user-1', email: 'sdr@example.com',
    provider: 'gmail', lastSyncAt: null,
  };

  it('returns skipped if account not found', async () => {
    mockAccountFindUnique.mockResolvedValue(null);

    const result = await handleEmailSync({ accountId: 'acct-1' });

    expect(result).toEqual({ skipped: true, reason: 'account_not_found' });
  });

  it('returns skipped if account is inactive', async () => {
    mockAccountFindUnique.mockResolvedValue({ ...mockAccount, isActive: false });

    const result = await handleEmailSync({ accountId: 'acct-1' });

    expect(result).toEqual({ skipped: true, reason: 'account_inactive' });
  });

  it('returns skipped if adapter does not support sync', async () => {
    mockAccountFindUnique.mockResolvedValue(mockAccount);
    (EmailService.fromAccount as ReturnType<typeof vi.fn>).mockResolvedValue({
      fetchMessagesSince: vi.fn().mockResolvedValue(null),
    });

    const result = await handleEmailSync({ accountId: 'acct-1' });

    expect(result).toEqual({ skipped: true, reason: 'adapter_does_not_support_sync' });
    expect(mockAccountUpdate).toHaveBeenCalledWith({
      where: { id: 'acct-1' },
      data: { lastSyncAt: expect.any(Date) },
    });
  });

  it('processes bounce messages', async () => {
    const mockMsg = {
      providerMessageId: 'gmail-1',
      fromEmail: 'mailer-daemon@google.com',
      subject: 'Delivery Status Notification (Failure)',
      date: new Date(),
      failedRecipient: 'lead@acme.com',
    };
    mockAccountFindUnique.mockResolvedValue(mockAccount);
    (EmailService.fromAccount as ReturnType<typeof vi.fn>).mockResolvedValue({
      fetchMessagesSince: vi.fn().mockResolvedValue([mockMsg]),
    });
    (isBounceMessage as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (extractBouncedRecipient as ReturnType<typeof vi.fn>).mockReturnValue('lead@acme.com');
    mockLeadFindMany.mockResolvedValue([{
      id: 'lead-1', email: 'lead@acme.com', firstName: 'Lead', lastName: 'Test',
      company: 'Acme', sequenceId: 'seq-1', assignedToId: 'user-1',
      tags: [], emailInvalid: false, tenantId: 'tenant-1',
    }]);
    mockSuppressionFindFirst.mockResolvedValue(null);
    mockAccountFindUnique
      .mockResolvedValueOnce(mockAccount)   // first call in handleEmailSync
      .mockResolvedValueOnce(mockAccount);  // called by handleApplyBounce for tenantId

    const result = await handleEmailSync({ accountId: 'acct-1' });

    expect(result).toEqual({ success: true, accountId: 'acct-1', messagesProcessed: 1, replies: 0, bounces: 1 });
    expect(mockLeadUpdate).toHaveBeenCalled();
    expect(mockSuppressionCreate).toHaveBeenCalled();
    expect(mockAccountUpdate).toHaveBeenCalled();
  });

  it('processes reply messages', async () => {
    const mockMsg = {
      providerMessageId: 'gmail-2',
      fromEmail: 'lead@acme.com',
      subject: 'Re: Your outreach',
      date: new Date(),
    };
    mockAccountFindUnique.mockResolvedValue(mockAccount);
    (EmailService.fromAccount as ReturnType<typeof vi.fn>).mockResolvedValue({
      fetchMessagesSince: vi.fn().mockResolvedValue([mockMsg]),
    });
    (isBounceMessage as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (isAutoReply as ReturnType<typeof vi.fn>).mockReturnValue(false);
    mockLeadFindMany.mockResolvedValue([{
      id: 'lead-1', email: 'lead@acme.com', stage: 'contacted', sequenceStatus: 'active',
      assignedToId: 'user-1', firstName: 'Lead', lastName: 'Test', company: 'Acme',
      sequenceId: 'seq-1',
    }]);

    const result = await handleEmailSync({ accountId: 'acct-1' });

    expect(result).toEqual({ success: true, accountId: 'acct-1', messagesProcessed: 1, replies: 1, bounces: 0 });
    expect(mockLeadUpdate).toHaveBeenCalledWith({
      where: { id: 'lead-1' },
      data: { stage: 'replied' },
    });
    expect(mockAccountUpdate).toHaveBeenCalled();
  });

  it('skips auto-reply messages', async () => {
    const mockMsg = {
      providerMessageId: 'gmail-3',
      fromEmail: 'lead@acme.com',
      subject: 'Out of Office',
      date: new Date(),
    };
    mockAccountFindUnique.mockResolvedValue(mockAccount);
    (EmailService.fromAccount as ReturnType<typeof vi.fn>).mockResolvedValue({
      fetchMessagesSince: vi.fn().mockResolvedValue([mockMsg]),
    });
    (isBounceMessage as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (isAutoReply as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const result = await handleEmailSync({ accountId: 'acct-1' });

    expect(result).toEqual({ success: true, accountId: 'acct-1', messagesProcessed: 1, replies: 0, bounces: 0 });
    expect(mockLeadFindFirst).not.toHaveBeenCalled();
  });
});
