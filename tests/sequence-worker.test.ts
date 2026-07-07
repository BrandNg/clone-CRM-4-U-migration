import { vi, describe, it, expect, beforeEach } from 'vitest';
import type {
  SequenceEnrollPayload,
  SequenceAdvancePayload,
  SequencePausePayload,
  SequenceUnenrollPayload,
  SequenceRebuildPayload,
} from '@/lib/bullmq/types';

const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateMany = vi.fn();
const mockFindFirst = vi.fn();
const mockCreate = vi.fn();
const mockActivityCreate = vi.fn();
const mockCreateTaskForStep = vi.fn();
const mockAdvanceSequence = vi.fn();
const mockPauseSequence = vi.fn();
const mockUnenrollLead = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    lead: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    sequence: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    sequenceEnrollment: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
    activity: {
      create: (...args: unknown[]) => mockActivityCreate(...args),
    },
  },
}));

vi.mock('@/lib/sequences/engine', () => ({
  createTaskForStep: (...args: unknown[]) => mockCreateTaskForStep(...args),
  advanceSequence: (...args: unknown[]) => mockAdvanceSequence(...args),
  pauseSequence: (...args: unknown[]) => mockPauseSequence(...args),
  unenrollLead: (...args: unknown[]) => mockUnenrollLead(...args),
}));

vi.mock('@/lib/tenant-context', () => ({
  tenantStorage: {
    run: (_: unknown, fn: () => unknown) => fn(),
  },
}));

const { handleEnroll, handleAdvance, handlePause, handleUnenroll, handleRebuild } = await import('@/workers/sequence');

const TENANT_ID = 'default-tenant';

function mockLead(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-1',
    tenantId: TENANT_ID,
    assignedToId: 'user-1',
    priority: 'warm' as const,
    stage: 'new' as const,
    sequenceId: null,
    sequenceStep: null,
    sequenceStatus: null,
    ...overrides,
  };
}

function mockSequence(overrides: Record<string, unknown> = {}) {
  return {
    id: 'seq-1',
    tenantId: TENANT_ID,
    name: 'Test Sequence',
    isActive: true,
    version: 1,
    steps: [
      { id: 'step-1', order: 1, channel: 'email', delayDays: 0, delayHours: 1, instructions: 'Step 1', autoComplete: false },
      { id: 'step-2', order: 2, channel: 'linkedin', delayDays: 2, delayHours: 0, instructions: 'Step 2', autoComplete: false },
    ],
    ...overrides,
  };
}

describe('handleEnroll', () => {
  const payload: SequenceEnrollPayload = { leadId: 'lead-1', sequenceId: 'seq-1', userId: 'user-1' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates enrollment, updates lead, logs activity, creates first task', async () => {
    mockFindUnique
      .mockResolvedValueOnce(mockLead()) // lead
      .mockResolvedValueOnce(mockSequence()); // sequence with steps

    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockCreate.mockResolvedValue({ id: 'enrollment-1' });
    mockUpdate.mockResolvedValue(mockLead({ sequenceId: 'seq-1', sequenceStep: 1, sequenceStatus: 'active' }));
    mockActivityCreate.mockResolvedValue({});
    mockCreateTaskForStep.mockResolvedValue({});

    const result = await handleEnroll(payload);

    expect(result).toEqual({ success: true, leadId: 'lead-1', sequenceId: 'seq-1' });

    // Enrollment created
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        leadId: 'lead-1',
        sequenceId: 'seq-1',
        status: 'active',
        currentStep: 1,
        tenantId: TENANT_ID,
      }),
    });

    // Lead updated
    const updateCall = mockUpdate.mock.calls.find(
      (args: any[]) => args[0]?.where?.id === 'lead-1'
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![0].data).toMatchObject({
      sequenceId: 'seq-1',
      sequenceStep: 1,
      sequenceStatus: 'active',
    });

    // Activity logged
    expect(mockActivityCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        leadId: 'lead-1',
        type: 'sequence_enrolled',
      }),
    });

    // First task created
    expect(mockCreateTaskForStep).toHaveBeenCalled();
  });

  it('throws if sequence not found', async () => {
    mockFindUnique
      .mockResolvedValueOnce(mockLead())
      .mockResolvedValueOnce(null);

    await expect(handleEnroll(payload)).rejects.toThrow('Cannot enroll');
  });

  it('throws if sequence is inactive', async () => {
    mockFindUnique
      .mockResolvedValueOnce(mockLead())
      .mockResolvedValueOnce(mockSequence({ isActive: false }));

    await expect(handleEnroll(payload)).rejects.toThrow('Cannot enroll');
  });

  it('throws if sequence has no steps', async () => {
    mockFindUnique
      .mockResolvedValueOnce(mockLead())
      .mockResolvedValueOnce(mockSequence({ steps: [] }));

    await expect(handleEnroll(payload)).rejects.toThrow('Cannot enroll');
  });

  it('unenrolls from previous sequence when switching', async () => {
    const prevSeqId = 'seq-old';
    mockFindUnique
      .mockResolvedValueOnce(mockLead({ sequenceId: prevSeqId })) // lead
      .mockResolvedValueOnce(mockSequence()) // sequence
      .mockResolvedValueOnce({ id: prevSeqId, name: 'Old Sequence' }); // prev sequence lookup

    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockCreate.mockResolvedValue({ id: 'enrollment-2' });
    mockUpdate.mockResolvedValue(mockLead({ sequenceId: 'seq-1', sequenceStep: 1, sequenceStatus: 'active' }));
    mockActivityCreate.mockResolvedValue({});
    mockCreateTaskForStep.mockResolvedValue({});

    await handleEnroll(payload);

    expect(mockUnenrollLead).toHaveBeenCalledWith('lead-1', prevSeqId);
  });
});

describe('handleAdvance', () => {
  const payload: SequenceAdvancePayload = { leadId: 'lead-1', sequenceId: 'seq-1', currentStep: 1 };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFindFirst.mockResolvedValue({ id: 'enrollment-1', leadId: 'lead-1', sequenceId: 'seq-1', status: 'active', currentStep: 1 });
  });

  it('skips if no active enrollment', async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await handleAdvance(payload);

    expect(result).toEqual({ skipped: true, reason: 'no_active_enrollment' });
    expect(mockAdvanceSequence).not.toHaveBeenCalled();
  });

  it('skips if lead already advanced past current step (CAS)', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'lead-1', sequenceStep: 3 });

    const result = await handleAdvance(payload);

    expect(result).toEqual({ skipped: true, reason: 'stale_step' });
    expect(mockAdvanceSequence).not.toHaveBeenCalled();
  });

  it('delegates to engine and marks enrollment completed when sequence ends', async () => {
    // lead check passes (step matches)
    mockFindUnique
      .mockResolvedValueOnce({ id: 'lead-1', sequenceStep: 1 })
      .mockResolvedValueOnce({ id: 'lead-1', sequenceId: null, sequenceStep: null }); // lead cleared by engine

    await handleAdvance(payload);

    expect(mockAdvanceSequence).toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'enrollment-1' },
      data: expect.objectContaining({ status: 'completed' }),
    });
  });

  it('syncs enrollment currentStep after engine advance', async () => {
    mockFindUnique
      .mockResolvedValueOnce({ id: 'lead-1', sequenceStep: 1 })
      .mockResolvedValueOnce({ id: 'lead-1', sequenceId: 'seq-1', sequenceStep: 2 }); // advanced by engine

    await handleAdvance(payload);

    expect(mockAdvanceSequence).toHaveBeenCalled();
    const enrollmentUpdate = mockUpdate.mock.calls.find(
      (args: any[]) => args[0]?.where?.id === 'enrollment-1'
    );
    expect(enrollmentUpdate![0].data).toMatchObject({ currentStep: 2 });
  });
});

describe('handlePause', () => {
  const payload: SequencePausePayload = { leadId: 'lead-1', reason: 'replied', userId: 'user-1' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pauses active enrollment and delegates to engine', async () => {
    mockFindFirst.mockResolvedValue({ id: 'enrollment-1', sequenceId: 'seq-1' });
    mockUpdate.mockResolvedValue({});

    const result = await handlePause(payload);

    expect(result).toEqual({ success: true, leadId: 'lead-1', sequenceId: 'seq-1', reason: 'replied' });
    expect(mockPauseSequence).toHaveBeenCalledWith('lead-1', 'replied', 'user-1');
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'enrollment-1' },
      data: { status: 'paused' },
    });
  });

  it('skips if no active enrollment', async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await handlePause(payload);

    expect(result).toEqual({ skipped: true, reason: 'no_active_enrollment' });
    expect(mockPauseSequence).not.toHaveBeenCalled();
  });
});

describe('handleUnenroll', () => {
  const payload: SequenceUnenrollPayload = { leadId: 'lead-1', sequenceId: 'seq-1' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates enrollment status and delegates to engine', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const result = await handleUnenroll(payload);

    expect(result).toEqual({ success: true, leadId: 'lead-1', sequenceId: 'seq-1' });
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { leadId: 'lead-1', sequenceId: 'seq-1', status: { in: ['active', 'paused'] } },
      data: expect.objectContaining({ status: 'unenrolled' }),
    });
    expect(mockUnenrollLead).toHaveBeenCalledWith('lead-1', 'seq-1');
  });
});

describe('handleRebuild', () => {
  const payload: SequenceRebuildPayload = { sequenceId: 'seq-1' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates the sequence exists and returns success', async () => {
    mockFindUnique.mockResolvedValue({ id: 'seq-1' });

    const result = await handleRebuild(payload);

    expect(result).toEqual({ success: true, sequenceId: 'seq-1' });
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: 'seq-1' },
      select: { id: true },
    });
  });

  it('throws if sequence not found', async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(handleRebuild(payload)).rejects.toThrow('Sequence not found');
  });
});
