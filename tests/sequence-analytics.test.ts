import { vi, describe, it, expect, beforeEach } from 'vitest';

const leadCount = vi.fn();
const activityCount = vi.fn();
const sequenceFindMany = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    lead: { count: (...a: unknown[]) => leadCount(...a) },
    activity: { count: (...a: unknown[]) => activityCount(...a), findMany: vi.fn() },
    sequence: { findMany: (...a: unknown[]) => sequenceFindMany(...a) },
  },
}));

const getLeadWhereScope = vi.fn();
const getVisibleUserIds = vi.fn();
vi.mock('@/lib/auth', () => ({
  getLeadWhereScope: (...a: unknown[]) => getLeadWhereScope(...a),
  getVisibleUserIds: (...a: unknown[]) => getVisibleUserIds(...a),
}));

const { getDashboardStats, getScopedSequenceStats } = await import('@/lib/sequences/analytics');

const wheresOf = (mock: typeof activityCount) =>
  mock.mock.calls.map((c) => (c[0] as { where: Record<string, any> }).where);

beforeEach(() => {
  vi.clearAllMocks();
  leadCount.mockResolvedValue(0);
  activityCount.mockResolvedValue(0);
  sequenceFindMany.mockResolvedValue([]);
});

describe('getDashboardStats — personal replies metric (F1a fix)', () => {
  it('counts replies on the viewer\'s OWN leads, not "everyone except the viewer"', async () => {
    await getDashboardStats('user-1');

    const replyWheres = wheresOf(activityCount).filter((w) => w.type === 'stage_changed');
    expect(replyWheres).toHaveLength(2); // today + week
    for (const w of replyWheres) {
      expect(w.lead).toEqual({ assignedToId: 'user-1' });
      expect(w.userId).toBeUndefined(); // the old `userId: { not: userId }` is gone
      expect(w.metadata).toEqual({ path: ['to'], equals: 'replied' });
    }
  });

  it('keeps sends scoped to the viewer (sender axis)', async () => {
    await getDashboardStats('user-1');
    const sendWheres = wheresOf(activityCount).filter((w) => w.type === 'email_sent');
    expect(sendWheres).toHaveLength(3); // today/week/month
    for (const w of sendWheres) expect(w.userId).toBe('user-1');
  });
});

describe('getScopedSequenceStats — manager report scoping (F1b)', () => {
  const tlUser = { id: 'mgr', role: 'team_lead', email: '', firstName: '', lastName: '' } as any;

  it('applies getLeadWhereScope + getVisibleUserIds for a pod-scoped manager', async () => {
    getLeadWhereScope.mockResolvedValue({ assignedToId: { in: ['a', 'b'] } });
    getVisibleUserIds.mockResolvedValue(['a', 'b']);
    sequenceFindMany.mockResolvedValue([{ id: 'seq1', name: 'S1' }]);

    await getScopedSequenceStats(tlUser);

    // Sends scoped to the visible users.
    const sendWheres = wheresOf(activityCount).filter((w) => w.type === 'email_sent');
    expect(sendWheres).toHaveLength(3);
    for (const w of sendWheres) expect(w.userId).toEqual({ in: ['a', 'b'] });

    // Replies scoped by the lead axis (the manager's scope).
    const replyWheres = wheresOf(activityCount).filter((w) => w.type === 'stage_changed');
    expect(replyWheres).toHaveLength(2);
    for (const w of replyWheres) expect(w.lead).toEqual({ assignedToId: { in: ['a', 'b'] } });

    // Lead counts: total uses the scope directly; filtered counts AND-compose so they can't widen it.
    const leadWheres = leadCount.mock.calls.map((c) => (c[0] as { where: any }).where);
    expect(leadWheres).toContainEqual({ assignedToId: { in: ['a', 'b'] } }); // totalLeads
    expect(leadWheres).toContainEqual({ AND: [{ assignedToId: { in: ['a', 'b'] } }, { sequenceStatus: 'active' }] });
    expect(leadWheres).toContainEqual({ AND: [{ assignedToId: { in: ['a', 'b'] } }, { sequenceId: 'seq1' }] });
  });

  it('leaves send scope unrestricted when getVisibleUserIds is null (director)', async () => {
    getLeadWhereScope.mockResolvedValue({});
    getVisibleUserIds.mockResolvedValue(null);
    sequenceFindMany.mockResolvedValue([]);

    await getScopedSequenceStats({ id: 'dir', role: 'director', email: '', firstName: '', lastName: '' } as any);

    const sendWheres = wheresOf(activityCount).filter((w) => w.type === 'email_sent');
    for (const w of sendWheres) expect(w.userId).toBeUndefined(); // unrestricted
  });
});
