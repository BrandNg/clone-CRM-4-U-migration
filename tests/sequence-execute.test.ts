import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Prisma model mocks
const mockTaskFindUnique = vi.fn();
const mockTaskUpdateMany = vi.fn();
const mockTaskUpdate = vi.fn();
const mockStepFindFirst = vi.fn();
const mockAccountFindFirst = vi.fn();
const mockAbVariantUpdate = vi.fn();
const mockLeadUpdate = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    task: {
      findUnique: (...a: unknown[]) => mockTaskFindUnique(...a),
      updateMany: (...a: unknown[]) => mockTaskUpdateMany(...a),
      update: (...a: unknown[]) => mockTaskUpdate(...a),
    },
    sequenceStep: { findFirst: (...a: unknown[]) => mockStepFindFirst(...a) },
    emailAccount: { findFirst: (...a: unknown[]) => mockAccountFindFirst(...a) },
    abTestVariant: { update: (...a: unknown[]) => mockAbVariantUpdate(...a) },
    lead: { update: (...a: unknown[]) => mockLeadUpdate(...a) },
  },
}));

const mockCreateOutbound = vi.fn();
const mockEnqueueSend = vi.fn();
vi.mock('@/lib/workflows/email', () => ({
  createOutboundMessage: (...a: unknown[]) => mockCreateOutbound(...a),
  enqueueEmailSendWorkflow: (...a: unknown[]) => mockEnqueueSend(...a),
}));

vi.mock('@/lib/templates/render', () => ({
  renderTemplate: (text: string) => `rendered:${text}`,
}));

const mockAdvance = vi.fn();
vi.mock('@/lib/sequences/engine', () => ({
  createTaskForStep: vi.fn(),
  advanceSequence: (...a: unknown[]) => mockAdvance(...a),
  pauseSequence: vi.fn(),
  unenrollLead: vi.fn(),
}));

const { handleExecuteTask } = await import('@/workers/sequence');

const TENANT_ID = 'default-tenant';

function buildLead(over: Record<string, unknown> = {}) {
  return {
    id: 'lead-1',
    email: 'prospect@acme.com',
    emailInvalid: false,
    sequenceId: 'seq-1',
    sequenceStatus: 'active',
    assignedToId: 'user-1',
    assignedTo: { id: 'user-1', firstName: 'Sam', lastName: 'Rep', role: 'sdr' },
    ...over,
  };
}

function buildTask(over: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    status: 'pending',
    type: 'email',
    sequenceId: 'seq-1',
    sequenceStep: 1,
    leadId: 'lead-1',
    tenantId: TENANT_ID,
    lead: buildLead(),
    ...over,
  };
}

function buildStep(over: Record<string, unknown> = {}) {
  return {
    id: 'step-1',
    order: 1,
    channel: 'email',
    autoComplete: true,
    template: { id: 'tmpl-1', subject: 'Hi {{firstName}}', body: 'Body', abVariants: [] },
    ...over,
  };
}

function arrangeEligible() {
  mockTaskFindUnique.mockResolvedValue(buildTask());
  mockStepFindFirst.mockResolvedValue(buildStep());
  mockAccountFindFirst.mockResolvedValue({ id: 'acct-1', email: 'sdr@telestar.vn' });
  mockTaskUpdateMany.mockResolvedValue({ count: 1 });
  mockCreateOutbound.mockResolvedValue({ id: 'out-1' });
  mockEnqueueSend.mockResolvedValue('job-1');
  mockTaskUpdate.mockResolvedValue({});
  mockLeadUpdate.mockResolvedValue({});
  mockAdvance.mockResolvedValue(undefined);
}

describe('handleExecuteTask', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('sends, completes the task, bumps the counter, and advances the sequence', async () => {
    arrangeEligible();

    const result = await handleExecuteTask({ taskId: 'task-1' });

    expect(result).toEqual({ status: 'completed', taskId: 'task-1' });
    expect(mockCreateOutbound).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: 'lead-1', accountId: 'acct-1', to: 'prospect@acme.com', tenantId: TENANT_ID }),
    );
    expect(mockEnqueueSend).toHaveBeenCalledWith(
      expect.objectContaining({ outboundMessageId: 'out-1', accountId: 'acct-1', to: 'prospect@acme.com' }),
      TENANT_ID,
    );
    expect(mockTaskUpdate).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: expect.objectContaining({ status: 'completed' }),
    });
    expect(mockLeadUpdate).toHaveBeenCalledWith({ where: { id: 'lead-1' }, data: { emailSentCount: { increment: 1 } } });
    expect(mockAdvance).toHaveBeenCalled();
  });

  it('ignores a missing task', async () => {
    mockTaskFindUnique.mockResolvedValue(null);
    expect(await handleExecuteTask({ taskId: 'gone' })).toEqual({ status: 'ignored', reason: 'task_not_found' });
  });

  it('ignores a task that is no longer pending', async () => {
    mockTaskFindUnique.mockResolvedValue(buildTask({ status: 'completed' }));
    expect(await handleExecuteTask({ taskId: 'task-1' })).toEqual({
      status: 'ignored',
      reason: 'task_status_is_completed',
    });
  });

  it('returns manual_action_required for a non-email task', async () => {
    mockTaskFindUnique.mockResolvedValue(buildTask({ type: 'call' }));
    expect(await handleExecuteTask({ taskId: 'task-1' })).toEqual({ status: 'manual_action_required', type: 'call' });
  });

  it('skips when the lead is no longer actively enrolled (paused)', async () => {
    mockTaskFindUnique.mockResolvedValue(buildTask({ lead: buildLead({ sequenceStatus: 'paused' }) }));
    mockStepFindFirst.mockResolvedValue(buildStep());
    expect(await handleExecuteTask({ taskId: 'task-1' })).toEqual({
      status: 'skipped',
      reason: 'lead_ineligible_or_paused',
    });
    expect(mockCreateOutbound).not.toHaveBeenCalled();
  });

  it('fails when the assignee has no active mailbox', async () => {
    mockTaskFindUnique.mockResolvedValue(buildTask());
    mockStepFindFirst.mockResolvedValue(buildStep());
    mockAccountFindFirst.mockResolvedValue(null);
    expect(await handleExecuteTask({ taskId: 'task-1' })).toEqual({
      status: 'failed',
      reason: 'no_active_mailbox_connected',
    });
  });

  it('does not send when the CAS lock is lost to another runner', async () => {
    arrangeEligible();
    mockTaskUpdateMany.mockResolvedValue({ count: 0 });
    expect(await handleExecuteTask({ taskId: 'task-1' })).toEqual({
      status: 'ignored',
      reason: 'concurrency_lock_failed',
    });
    expect(mockCreateOutbound).not.toHaveBeenCalled();
  });

  it('records the A/B variant send when both A and B variants exist', async () => {
    arrangeEligible();
    mockStepFindFirst.mockResolvedValue(
      buildStep({
        template: {
          id: 'tmpl-1',
          subject: 'S',
          body: 'B',
          abVariants: [
            { id: 'va', version: 'A', subject: 'SA', body: 'BA' },
            { id: 'vb', version: 'B', subject: 'SB', body: 'BB' },
          ],
        },
      }),
    );
    mockAbVariantUpdate.mockResolvedValue({});
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // < 0.5 → variant A

    await handleExecuteTask({ taskId: 'task-1' });

    expect(mockAbVariantUpdate).toHaveBeenCalledWith({
      where: { id: 'va' },
      data: { sentCount: { increment: 1 } },
    });
  });
});
