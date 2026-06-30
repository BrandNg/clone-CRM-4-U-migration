import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, getVisibleUserIds, canAccessLead } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { parseBody, capLimit } from '@/lib/validation/core';
import { createActivitySchema } from '@/lib/validation/schemas';
import { nextBusinessDay } from '@/lib/dates/businessDays';
import { handleApiError } from '@/lib/api/errors';

export async function GET(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { searchParams } = new URL(req.url);
  const leadId = searchParams.get('leadId');
  const userId = searchParams.get('userId');
  const type = searchParams.get('type');
  const limit = capLimit(searchParams.get('limit'), 50, 200);

  const visibleIds = await getVisibleUserIds(user);

  if (leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { assignedToId: true, campaignId: true } });
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    if (!(await canAccessLead(user, lead))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const scopeUserId = userId && userId !== 'all' ? userId : undefined;
  if (visibleIds && scopeUserId && !visibleIds.includes(scopeUserId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const activities = await prisma.activity.findMany({
    where: {
      ...(visibleIds
        ? { userId: { in: scopeUserId ? [scopeUserId] : visibleIds } }
        : scopeUserId
        ? { userId: scopeUserId }
        : {}),
      ...(leadId ? { leadId } : {}),
      ...(type ? { type: type as any } : {}),
    },
    include: {
      user: { select: { id: true, firstName: true, lastName: true } },
      lead: { select: { id: true, firstName: true, lastName: true, company: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return NextResponse.json(activities);
}

export async function POST(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const parsed = await parseBody(req, createActivitySchema, 'Invalid activity create');
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  try {
    let lead: { id: string; firstName: string; lastName: string; assignedToId: string | null; campaignId: string | null; tenantId: string } | null = null;
    if (body.leadId) {
      lead = await prisma.lead.findUnique({
        where: { id: body.leadId },
        select: { id: true, firstName: true, lastName: true, assignedToId: true, campaignId: true, tenantId: true },
      });
      if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
      if (!(await canAccessLead(user, lead))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const activity = await prisma.activity.create({
      data: {
        userId: user.id,
        leadId: body.leadId,
        sequenceId: body.sequenceId,
        type: body.type,
        channel: body.channel,
        description: body.description,
        metadata: body.metadata as object | undefined,
      },
    });

    if (
      lead &&
      (body.type === 'call_logged' || body.type === 'call_made') &&
      (body.metadata as Record<string, unknown> | undefined)?.outcome === 'callback_requested'
    ) {
      await prisma.task.create({
        data: {
          leadId: lead.id,
          userId: lead.assignedToId ?? user.id,
          type: 'phone',
          title: `Callback: ${lead.firstName} ${lead.lastName}`,
          description: 'Callback requested on previous call',
          dueDate: nextBusinessDay(new Date()),
          priority: 'high',
        },
      });
    }

    return NextResponse.json(activity, { status: 201 });
  } catch (err) {
    return handleApiError('api/activities POST', err);
  }
}
