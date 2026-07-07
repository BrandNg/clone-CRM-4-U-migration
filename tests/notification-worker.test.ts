import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockReminderFindUnique = vi.fn();
const mockNotificationFindFirst = vi.fn();
const mockNotificationCreate = vi.fn();
const mockUserFindMany = vi.fn();
const mockTaskCount = vi.fn();
const mockReminderCount = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    reminder: {
      findUnique: (...args: unknown[]) => mockReminderFindUnique(...args),
      count: (...args: unknown[]) => mockReminderCount(...args),
    },
    notification: {
      findFirst: (...args: unknown[]) => mockNotificationFindFirst(...args),
      create: (...args: unknown[]) => mockNotificationCreate(...args),
    },
    user: {
      findMany: (...args: unknown[]) => mockUserFindMany(...args),
    },
    task: {
      count: (...args: unknown[]) => mockTaskCount(...args),
    },
  },
}));

vi.mock('@/lib/tenant-context', () => ({
  tenantStorage: {
    run: (_: unknown, fn: () => unknown) => fn(),
  },
}));

const { handleReminderDue, handleDigestDaily } = await import('@/workers/notification');

describe('handleReminderDue', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('creates notification for a due reminder', async () => {
    mockReminderFindUnique.mockResolvedValue({
      id: 'rem-1',
      userId: 'user-1',
      text: 'Call John',
      leadId: 'lead-1',
      dueAt: new Date(),
      isDismissed: false,
      tenantId: 'tenant-1',
    });
    mockNotificationFindFirst.mockResolvedValue(null);

    const result = await handleReminderDue({ reminderId: 'rem-1' });

    expect(result).toEqual({ success: true, reminderId: 'rem-1' });
    expect(mockNotificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        type: 'reminder_due',
        title: 'Reminder Due',
        text: 'Call John',
        linkTo: '/leads/lead-1',
        tenantId: 'tenant-1',
      }),
    });
  });

  it('skips if reminder not found', async () => {
    mockReminderFindUnique.mockResolvedValue(null);

    const result = await handleReminderDue({ reminderId: 'rem-1' });

    expect(result).toEqual({ skipped: true, reason: 'not_found' });
    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });

  it('skips if already dismissed', async () => {
    mockReminderFindUnique.mockResolvedValue({
      id: 'rem-1',
      isDismissed: true,
    });

    const result = await handleReminderDue({ reminderId: 'rem-1' });

    expect(result).toEqual({ skipped: true, reason: 'already_dismissed' });
    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });

  it('skips if notification already exists for this reminder', async () => {
    mockReminderFindUnique.mockResolvedValue({
      id: 'rem-1',
      userId: 'user-1',
      text: 'Call John',
      dueAt: new Date(),
      isDismissed: false,
      tenantId: 'tenant-1',
    });
    mockNotificationFindFirst.mockResolvedValue({ id: 'notif-1' });

    const result = await handleReminderDue({ reminderId: 'rem-1' });

    expect(result).toEqual({ skipped: true, reason: 'already_notified' });
    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });

  it('creates notification without linkTo when no leadId', async () => {
    mockReminderFindUnique.mockResolvedValue({
      id: 'rem-2',
      userId: 'user-2',
      text: 'Team standup',
      leadId: null,
      dueAt: new Date(),
      isDismissed: false,
      tenantId: 'tenant-2',
    });
    mockNotificationFindFirst.mockResolvedValue(null);

    await handleReminderDue({ reminderId: 'rem-2' });

    expect(mockNotificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-2',
        text: 'Team standup',
        linkTo: undefined,
      }),
    });
  });
});

describe('handleDigestDaily', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('creates daily digest notification for users with overdue tasks', async () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    mockUserFindMany.mockResolvedValue([
      { id: 'user-1', tenantId: 'tenant-1' },
      { id: 'user-2', tenantId: 'tenant-2' },
    ]);
    mockTaskCount
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(0);
    mockReminderCount
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    mockNotificationFindFirst.mockResolvedValue(null);

    const result = await handleDigestDaily({});

    expect(result.usersProcessed).toBe(2);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({ userId: 'user-1', overdueCount: 3, remindersToday: 1 });
    expect(mockNotificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        type: 'digest_daily',
        title: expect.stringContaining('Daily Summary'),
        linkTo: '/tasks',
        tenantId: 'tenant-1',
      }),
    });
  });

  it('skips users with no overdue tasks and no reminders', async () => {
    mockUserFindMany.mockResolvedValue([
      { id: 'user-1', tenantId: 'tenant-1' },
    ]);
    mockTaskCount.mockResolvedValueOnce(0);
    mockReminderCount.mockResolvedValueOnce(0);

    const result = await handleDigestDaily({});

    expect(result.usersProcessed).toBe(1);
    expect(result.results).toHaveLength(0);
    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });

  it('supports filtering by specific userIds', async () => {
    mockUserFindMany.mockResolvedValue([
      { id: 'user-1', tenantId: 'tenant-1' },
    ]);
    mockTaskCount.mockResolvedValueOnce(2);
    mockReminderCount.mockResolvedValueOnce(0);
    mockNotificationFindFirst.mockResolvedValue(null);

    const result = await handleDigestDaily({ userIds: ['user-1'] });

    expect(result.usersProcessed).toBe(1);
    expect(mockUserFindMany).toHaveBeenCalledWith({
      where: { id: { in: ['user-1'] } },
      select: { id: true, tenantId: true },
    });
  });

  it('does not create duplicate digest on the same day', async () => {
    mockUserFindMany.mockResolvedValue([
      { id: 'user-1', tenantId: 'tenant-1' },
    ]);
    mockTaskCount.mockResolvedValueOnce(2);
    mockReminderCount.mockResolvedValueOnce(0);
    mockNotificationFindFirst.mockResolvedValue({ id: 'existing-digest' });

    const result = await handleDigestDaily({});

    expect(result.results).toHaveLength(1); // still counts the user
    expect(result.results[0].userId).toBe('user-1');
    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });
});
