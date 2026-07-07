import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, getVisibleUserIds, canAccessUser, canAccessLead } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { parseBody } from '@/lib/validation/core';
import { createTaskSchema } from '@/lib/validation/schemas';
import { handleApiError } from '@/lib/api/errors';
import { getLocalDayBoundaries } from '@/lib/dates/timezone';

export async function GET(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { searchParams } = new URL(req.url);
  const tab = searchParams.get('tab'); // 'today' | 'yesterday' | 'overdue'
  const leadId = searchParams.get('leadId');
  const scopeUserId = searchParams.get('userId');

  const targetIdForTz = (scopeUserId && scopeUserId !== 'all' && user.role !== 'sdr') ? scopeUserId : user.id;
  const userTzRecord = await prisma.user.findUnique({
    where: { id: targetIdForTz },
    select: { timezone: true },
  });
  const tz = userTzRecord?.timezone || 'UTC';

  const { start: todayStart, end: todayEnd, yesterdayStart } = getLocalDayBoundaries(new Date(), tz);

  let dateFilter: Record<string, any> = {};
  if (tab === 'today') {
    dateFilter = { dueDate: { gte: todayStart, lt: todayEnd } };
  } else if (tab === 'yesterday') {
    dateFilter = { dueDate: { gte: yesterdayStart, lt: todayStart } };
  } else if (tab === 'overdue') {
    dateFilter = { dueDate: { lt: todayStart }, status: 'pending' };
  }

  // Pod scoping: SDRs see own tasks; TL/FM see their pod/floor; director sees all.
  // Managers may further narrow to one visible userId via ?userId=.
  const visibleIds = await getVisibleUserIds(user);
  let userScope: Record<string, unknown> = visibleIds ? { userId: { in: visibleIds } } : {};
  if (scopeUserId && scopeUserId !== 'all' && user.role !== 'sdr') {
    if (visibleIds && !visibleIds.includes(scopeUserId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    userScope = { userId: scopeUserId };
  }

  // When viewing a single lead's tasks (lead slide-over), a TL/FM who can access
  // that lead by account sees ALL its tasks — even those owned by an out-of-pod
  // SDR — so they can work the account. Mirrors the lead detail access check.
  if (leadId && visibleIds) {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { assignedToId: true, campaignId: true },
    });
    if (lead && (await canAccessLead(user, lead))) {
      userScope = {};
    }
  }

  try {
    const tasks = await prisma.task.findMany({
      where: {
        ...userScope,
        ...(leadId ? { leadId } : {}),
        ...dateFilter,
      },
      include: {
        lead: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            company: true,
            crmPriorityScore: true,
            stage: true,
            tags: true,
          },
        },
        user: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ dueDate: 'asc' }],
      take: 500,
    });

    // Expose the lead's priority under its public name (`crmPriorityScore` is the DB field).
    const normalized = tasks.map((t) =>
      t.lead ? { ...t, lead: { ...t.lead, priority: t.lead.crmPriorityScore } } : t
    );
    if (tab === 'overdue') {
      return NextResponse.json(normalized);
    }
    const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const sorted = normalized.sort((a, b) => (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1));

    return NextResponse.json(sorted);
  } catch (err) {
    return handleApiError('api/tasks GET', err);
  }
}

export async function POST(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const parsed = await parseBody(req, createTaskSchema, 'Invalid task create');
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  const targetUserId = body.userId ?? user.id;
  if (targetUserId !== user.id && !(await canAccessUser(user, targetUserId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const lead = await prisma.lead.findUnique({ where: { id: body.leadId }, select: { assignedToId: true, campaignId: true } });
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  if (!(await canAccessLead(user, lead))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const task = await prisma.task.create({
      data: {
        leadId: body.leadId,
        userId: body.userId ?? user.id,
        type: body.type,
        title: body.title,
        description: body.description,
        dueDate: body.dueDate,
        sequenceId: body.sequenceId,
        sequenceStep: body.sequenceStep,
        priority: body.priority ?? 'medium',
      },
      include: {
        lead: { select: { id: true, firstName: true, lastName: true, company: true } },
      },
    });

    return NextResponse.json(task, { status: 201 });
  } catch (err) {
    return handleApiError('api/tasks POST', err);
  }
}
