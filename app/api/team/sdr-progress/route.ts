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

    if (!sdrId) {
      return NextResponse.json({ error: 'sdrId is required' }, { status: 400 });
    }

    const allUsers = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, role: true, managerId: true },
    });

    const visibleIds = computeVisibleUserIds(allUsers, user);
    if (visibleIds && !visibleIds.includes(sdrId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const rangeStart =
      dateRange === 'today' ? todayStart :
      dateRange === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1) :
      new Date(todayStart.getTime() - 7 * 86400000);

    // 1. Fetch Lead Stage Counts
    const leads = await prisma.lead.groupBy({
      by: ['stage'],
      where: { assignedToId: sdrId },
      _count: { _all: true },
    });

    const stageCounts: Record<string, number> = {
      new: 0,
      sequence_active: 0,
      replied: 0,
      meeting_booked: 0,
      won: 0,
      lost: 0,
    };
    for (const group of leads) {
      stageCounts[group.stage] = group._count._all;
    }

    // 2. Fetch Tasks count in range
    const tasks = await prisma.task.groupBy({
      by: ['status'],
      where: {
        userId: sdrId,
        createdAt: { gte: rangeStart },
      },
      _count: { _all: true },
    });

    const taskCounts = {
      completed: 0,
      skipped: 0,
      pending: 0,
      overdue: 0,
    };
    for (const group of tasks) {
      if (group.status === 'completed' || group.status === 'skipped' || group.status === 'pending') {
        taskCounts[group.status] = group._count._all;
      }
    }

    // Fetch overdue tasks separately
    const overdueCount = await prisma.task.count({
      where: {
        userId: sdrId,
        status: 'pending',
        dueDate: { lt: now },
      },
    });
    taskCounts.overdue = overdueCount;

    // 3. Fetch Recent outcomes/activities
    const recentActivities = await prisma.activity.findMany({
      where: {
        userId: sdrId,
        createdAt: { gte: rangeStart },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        type: true,
        description: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      stageCounts,
      taskProgress: taskCounts,
      recentOutcomes: recentActivities,
    });
  } catch (err) {
    return handleApiError('api/team/sdr-progress GET', err);
  }
}
