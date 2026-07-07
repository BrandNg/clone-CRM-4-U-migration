import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockTaskFindMany = vi.fn();
const mockTaskUpdate = vi.fn();
const mockLeadFindUnique = vi.fn();
const mockUserFindUnique = vi.fn();
const mockOutboundFindMany = vi.fn();
const mockOutboundUpdate = vi.fn();
const mockJobRunFindMany = vi.fn();
const mockJobRunUpdate = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    task: {
      findMany: (...args: unknown[]) => mockTaskFindMany(...args),
      update: (...args: unknown[]) => mockTaskUpdate(...args),
    },
    lead: {
      findUnique: (...args: unknown[]) => mockLeadFindUnique(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    outboundMessage: {
      findMany: (...args: unknown[]) => mockOutboundFindMany(...args),
      update: (...args: unknown[]) => mockOutboundUpdate(...args),
    },
    jobRun: {
      findMany: (...args: unknown[]) => mockJobRunFindMany(...args),
      update: (...args: unknown[]) => mockJobRunUpdate(...args),
    },
  },
}));

vi.mock('@/lib/tenant-context', () => ({
  tenantStorage: {
    run: (_: unknown, fn: () => unknown) => fn(),
  },
}));

const { handleRepair } = await import('@/workers/maintenance');

describe('handleRepair — orphan-tasks', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('marks pending tasks as skipped when their lead is missing', async () => {
    mockTaskFindMany.mockResolvedValue([{ id: 'task-1', leadId: 'lead-1', userId: 'user-1' }]);
    mockLeadFindUnique.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue({ id: 'user-1' });

    const result = await handleRepair({ types: ['orphan-tasks'] });

    expect(result['orphan-tasks'].fixed).toBe(1);
    expect(mockTaskUpdate).toHaveBeenCalledWith({
      where: { id: 'task-1', status: 'pending' },
      data: { status: 'skipped', notes: expect.stringContaining('orphan') },
    });
  });

  it('marks pending tasks as skipped when their user is missing', async () => {
    mockTaskFindMany.mockResolvedValue([{ id: 'task-1', leadId: 'lead-1', userId: 'user-1' }]);
    mockLeadFindUnique.mockResolvedValue({ id: 'lead-1' });
    mockUserFindUnique.mockResolvedValue(null);

    const result = await handleRepair({ types: ['orphan-tasks'] });

    expect(result['orphan-tasks'].fixed).toBe(1);
    expect(mockTaskUpdate).toHaveBeenCalledWith({
      where: { id: 'task-1', status: 'pending' },
      data: { status: 'skipped', notes: expect.stringContaining('orphan') },
    });
  });

  it('skips tasks where both lead and user exist', async () => {
    mockTaskFindMany.mockResolvedValue([{ id: 'task-1', leadId: 'lead-1', userId: 'user-1' }]);
    mockLeadFindUnique.mockResolvedValue({ id: 'lead-1' });
    mockUserFindUnique.mockResolvedValue({ id: 'user-1' });

    const result = await handleRepair({ types: ['orphan-tasks'] });

    expect(result['orphan-tasks'].fixed).toBe(0);
    expect(mockTaskUpdate).not.toHaveBeenCalled();
  });
});

describe('handleRepair — stale-sending', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('marks stale sending messages with providerMessageId as sent', async () => {
    const oldDate = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    mockOutboundFindMany.mockResolvedValue([{ id: 'msg-1', providerMessageId: 'prov-123', updatedAt: oldDate }]);

    const result = await handleRepair({ types: ['stale-sending'] });

    expect(result['stale-sending'].fixed).toBe(1);
    expect(mockOutboundUpdate).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: { status: 'sent', sentAt: expect.any(Date) },
    });
  });

  it('marks stale sending messages without providerMessageId as failed', async () => {
    const oldDate = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    mockOutboundFindMany.mockResolvedValue([{ id: 'msg-2', providerMessageId: null, updatedAt: oldDate }]);

    const result = await handleRepair({ types: ['stale-sending'] });

    expect(result['stale-sending'].fixed).toBe(1);
    expect(mockOutboundUpdate).toHaveBeenCalledWith({
      where: { id: 'msg-2' },
      data: { status: 'failed', errorMessage: expect.any(String) },
    });
  });
});

describe('handleRepair — stuck-running', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('marks active job runs older than 15m as failed', async () => {
    mockJobRunFindMany.mockResolvedValue([{ id: 'run-1' }]);

    const result = await handleRepair({ types: ['stuck-running'] });

    expect(result['stuck-running'].fixed).toBe(1);
    expect(mockJobRunUpdate).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: { status: 'failed', completedAt: expect.any(Date), failedReason: expect.any(String) },
    });
  });
});

describe('handleRepair — missing-delayed', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('locks pending email tasks past due with no lock', async () => {
    const pastDate = new Date(Date.now() - 3600000);
    mockTaskFindMany.mockResolvedValue([{ id: 'task-1', dueDate: pastDate }]);

    const result = await handleRepair({ types: ['missing-delayed'] });

    expect(result['missing-delayed'].fixed).toBe(1);
    expect(mockTaskUpdate).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { lockedAt: expect.any(Date) },
    });
  });
});

describe('handleRepair — reassignment-drift', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('updates task userId when lead reassigned', async () => {
    mockTaskFindMany.mockResolvedValue([{ id: 'task-1', userId: 'old-user', lead: { assignedToId: 'new-user' } }]);

    const result = await handleRepair({ types: ['reassignment-drift'] });

    expect(result['reassignment-drift'].fixed).toBe(1);
    expect(mockTaskUpdate).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { userId: 'new-user' },
    });
  });

  it('skips tasks where userId already matches lead assignee', async () => {
    mockTaskFindMany.mockResolvedValue([{ id: 'task-1', userId: 'user-1', lead: { assignedToId: 'user-1' } }]);

    const result = await handleRepair({ types: ['reassignment-drift'] });

    expect(result['reassignment-drift'].fixed).toBe(0);
    expect(mockTaskUpdate).not.toHaveBeenCalled();
  });
});

describe('handleRepair — multiple types', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('runs all requested repair types and returns per-type results', async () => {
    mockTaskFindMany.mockResolvedValue([]);
    mockOutboundFindMany.mockResolvedValue([]);
    mockJobRunFindMany.mockResolvedValue([]);

    const result = await handleRepair({
      types: ['orphan-tasks', 'stale-sending', 'stuck-running', 'missing-delayed', 'reassignment-drift'],
    });

    expect(Object.keys(result)).toEqual(['orphan-tasks', 'stale-sending', 'stuck-running', 'missing-delayed', 'reassignment-drift']);
  });
});
