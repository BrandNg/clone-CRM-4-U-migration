import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'morning';

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);

  // Determine visible user scope
  let userIdFilter: string[] | undefined;
  if (user.role === 'sdr' || user.role === 'leadgen') {
    userIdFilter = [user.id];
  } else if (user.role === 'team_lead') {
    const reports = await prisma.user.findMany({
      where: { managerId: user.id },
      select: { id: true },
    });
    userIdFilter = [user.id, ...reports.map((r) => r.id)];
  } else if (user.role === 'floor_manager') {
    const teamLeads = await prisma.user.findMany({
      where: { managerId: user.id },
      select: { id: true },
    });
    const sdrs = await prisma.user.findMany({
      where: { managerId: { in: teamLeads.map((t) => t.id) } },
      select: { id: true },
    });
    userIdFilter = [user.id, ...teamLeads.map((t) => t.id), ...sdrs.map((s) => s.id)];
  }
  // director: no filter (sees all)

  const userScope = userIdFilter ? { userId: { in: userIdFilter } } : {};

  if (type === 'morning') {
    const [overdueTasks, todayTasks, staleLeads, recentReplies] = await Promise.all([
      prisma.task.count({
        where: {
          ...userScope,
          status: 'pending',
          dueDate: { lt: todayStart },
        },
      }),
      prisma.task.findMany({
        where: {
          ...userScope,
          status: 'pending',
          dueDate: { gte: todayStart, lt: todayEnd },
        },
        include: { lead: { select: { firstName: true, lastName: true, company: true, stage: true } } },
        orderBy: { dueDate: 'asc' },
        take: 10,
      }),
      prisma.lead.count({
        where: {
          ...userScope,
          stage: { notIn: ['won', 'lost'] },
          lastContactedAt: { lt: new Date(now.getTime() - 7 * 86400000) },
        },
      }),
      prisma.lead.findMany({
        where: {
          ...userScope,
          stage: 'replied',
          updatedAt: { gte: new Date(now.getTime() - 86400000) },
        },
        select: { firstName: true, lastName: true, company: true },
        take: 3,
      }),
    ]);

    const byChannel = todayTasks.reduce<Record<string, number>>((acc, t) => {
      acc[t.type] = (acc[t.type] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      overdueTasks,
      todayTaskCount: todayTasks.length,
      todayTasksByChannel: byChannel,
      staleLeads,
      recentReplies,
      hotLeads: todayTasks
        .filter((t) => t.lead.stage === 'replied' || t.lead.stage === 'meeting_booked')
        .slice(0, 3)
        .map((t) => ({ name: `${t.lead.firstName} ${t.lead.lastName}`, company: t.lead.company, stage: t.lead.stage })),
    });
  }

  // EOD summary
  const [activities, tasksCompleted, tasksSkipped, stageChanges, meetingsBooked] = await Promise.all([
    prisma.activity.findMany({
      where: {
        ...userScope,
        createdAt: { gte: todayStart, lt: todayEnd },
      },
      select: { type: true, channel: true, userId: true },
    }),
    prisma.task.count({
      where: { ...userScope, status: 'completed', completedAt: { gte: todayStart, lt: todayEnd } },
    }),
    prisma.task.count({
      where: { ...userScope, status: 'skipped', updatedAt: { gte: todayStart, lt: todayEnd } },
    }),
    prisma.activity.findMany({
      where: {
        ...userScope,
        type: 'stage_changed',
        createdAt: { gte: todayStart, lt: todayEnd },
      },
      include: { lead: { select: { firstName: true, lastName: true, company: true } } },
      take: 5,
    }),
    prisma.activity.count({
      where: {
        ...userScope,
        type: 'meeting_booked',
        createdAt: { gte: todayStart, lt: todayEnd },
      },
    }),
  ]);

  const activityCounts = activities.reduce<Record<string, number>>((acc, a) => {
    acc[a.type] = (acc[a.type] || 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    date: todayStart.toISOString().split('T')[0],
    tasksCompleted,
    tasksSkipped,
    meetingsBooked,
    activityCounts,
    stageChanges: stageChanges.map((a) => ({
      lead: a.lead ? `${a.lead.firstName} ${a.lead.lastName}` : 'Unknown',
      company: a.lead?.company || '',
      metadata: a,
    })),
  });
}
