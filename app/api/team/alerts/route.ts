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
    const sdrId = searchParams.get('sdrId') ?? '';
    const managerId = searchParams.get('managerId') ?? '';

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const atRiskCutoff = new Date(todayStart.getTime() - 3 * 86400000);

    const allUsers = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, firstName: true, lastName: true, role: true, managerId: true },
    });

    const visibleIds = computeVisibleUserIds(allUsers, user);

  // Scoping target users
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

  // 1. Fetch overdue tasks grouped by user
  const overdueCounts = await prisma.task.groupBy({
    by: ['userId'],
    where: {
      status: 'pending',
      dueDate: { lt: todayStart },
      userId: { in: targetIds }
    },
    _count: { id: true }
  });
  const overdueMap = Object.fromEntries(
    overdueCounts.map((o) => [o.userId, o._count.id])
  );

  // 2. Fetch at-risk tasks and their associated leads
  const atRiskTasks = await prisma.task.findMany({
    where: {
      status: 'pending',
      sequenceId: { not: null },
      dueDate: { lt: atRiskCutoff },
      userId: { in: targetIds }
    },
    include: {
      lead: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          company: true
        }
      },
      user: {
        select: {
          firstName: true,
          lastName: true
        }
      }
    },
    orderBy: {
      dueDate: 'asc'
    },
    take: 50,
  });

  // Calculate days overdue for each task
  const atRiskLeads = atRiskTasks.map((t) => {
    const daysOverdue = Math.floor((todayStart.getTime() - t.dueDate.getTime()) / 86400000);
    return {
      id: t.id,
      leadId: t.leadId,
      leadName: `${t.lead.firstName} ${t.lead.lastName}`,
      company: t.lead.company,
      assignedTo: `${t.user.firstName} ${t.user.lastName}`,
      daysOverdue
    };
  });

  // Compile overdue info per user
  const scopedUsers = allUsers.filter((u) => targetIds.includes(u.id));
  const userAlerts = scopedUsers.map((u) => {
    const count = overdueMap[u.id] ?? 0;
    const userAtRisk = atRiskTasks.filter((t) => t.userId === u.id).length;
    return {
      userId: u.id,
      name: `${u.firstName} ${u.lastName}`,
      role: u.role,
      overdueCount: count,
      atRiskCount: userAtRisk
    };
  }).sort((a, b) => b.overdueCount - a.overdueCount);

    return NextResponse.json({
      users: userAlerts,
      atRiskLeads: atRiskLeads.slice(0, 10),
      totalAtRiskCount: atRiskLeads.length
    });
  } catch (err) {
    return handleApiError('api/team/alerts GET', err);
  }
}
