import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, canAccessLead } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { parseBody } from '@/lib/validation/core';
import { createReminderSchema } from '@/lib/validation/schemas';

export async function GET(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { searchParams } = new URL(req.url);
  const leadId = searchParams.get('leadId');

  if (leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { assignedToId: true, campaignId: true } });
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    if (!(await canAccessLead(user, lead))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const reminders = await prisma.reminder.findMany({
    where: {
      userId: user.id,
      isDismissed: false,
      ...(leadId ? { leadId } : {}),
    },
    orderBy: { dueAt: 'asc' },
  });

  return NextResponse.json(reminders);
}

export async function POST(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const parsed = await parseBody(req, createReminderSchema, 'Invalid reminder create');
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  if (body.leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: body.leadId }, select: { assignedToId: true, campaignId: true } });
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    if (!(await canAccessLead(user, lead))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const reminder = await prisma.reminder.create({
    data: {
      userId: user.id,
      text: body.text,
      dueAt: body.dueAt,
      leadId: body.leadId ?? null,
      isDismissed: false,
    },
  });

  return NextResponse.json(reminder, { status: 201 });
}
