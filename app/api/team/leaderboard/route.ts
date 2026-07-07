import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireManager } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { computeVisibleUserIds } from '@/lib/podScoping';
import { handleApiError } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const userOrRes = await requireManager();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  try {
    const { searchParams } = new URL(req.url);
    const dateRange = searchParams.get('dateRange') ?? 'week';
    const sdrId = searchParams.get('sdrId') ?? '';
    const managerId = searchParams.get('managerId') ?? '';

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const rangeStart =
      dateRange === 'today' ? todayStart :
      dateRange === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1) :
      new Date(todayStart.getTime() - 7 * 86400000);

    const allUsers = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, firstName: true, lastName: true, role: true, managerId: true },
    });

  const visibleIds = computeVisibleUserIds(allUsers, user);

  // Filter scoped users based on query parameters
  let targetIds = visibleIds ? [...visibleIds] : allUsers.map((u) => u.id);

  if (sdrId) {
    if (visibleIds && !visibleIds.includes(sdrId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    targetIds = [sdrId];
  } else if (managerId) {
    const podIds = allUsers.filter((u) => u.managerId === managerId).map((u) => u.id);
    targetIds = visibleIds ? podIds.filter((id) => visibleIds.includes(id)) : podIds;
  }

  // Aggregate activity counts in the DB (uses the [userId, type, createdAt] index)
  // instead of pulling thousands of rows and bucketing them per user in JS.
  const counts = await prisma.activity.groupBy({
    by: ['userId', 'type'],
    where: {
      createdAt: { gte: rangeStart },
      userId: { in: targetIds },
    },
    _count: { _all: true },
  });

  // userId -> (activityType -> count)
  const countsByUser = new Map<string, Map<string, number>>();
  for (const row of counts) {
    let typeMap = countsByUser.get(row.userId);
    if (!typeMap) {
      typeMap = new Map<string, number>();
      countsByUser.set(row.userId, typeMap);
    }
    typeMap.set(row.type, row._count._all);
  }

  const scopedUsers = allUsers.filter((u) => targetIds.includes(u.id) && ['sdr', 'team_lead', 'floor_manager', 'leadgen'].includes(u.role));

  const leaderboard = scopedUsers.map((u) => {
    const t = countsByUser.get(u.id);
    const c = (type: string) => t?.get(type) ?? 0;

    const calls = c('call_logged') + c('call_made');
    const emails = c('email_sent');
    const linkedin = c('linkedin_touch') + c('linkedin_sent');
    const whatsapp = c('whatsapp_message') + c('whatsapp_sent');
    const booked = c('meeting_booked');

    const total = calls + emails + linkedin + whatsapp + booked;

    return {
      id: u.id,
      name: `${u.firstName} ${u.lastName}`,
      role: u.role,
      calls,
      emails,
      linkedin,
      whatsapp,
      booked,
      total
    };
  }).sort((a, b) => b.booked - a.booked || b.total - a.total);

    return NextResponse.json(leaderboard);
  } catch (err) {
    return handleApiError('api/team/leaderboard GET', err);
  }
}
