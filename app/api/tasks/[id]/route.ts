import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, canAccessUser, canAccessLead } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { advanceSequence } from '@/lib/sequences/engine';
import { nextBusinessDay } from '@/lib/dates/businessDays';
import { parseBody } from '@/lib/validation/core';
import { updateTaskSchema } from '@/lib/validation/schemas';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { id } = await params;
  const task = await prisma.task.findUnique({ where: { id }, include: { lead: true } });
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await canAccessUser(user, task.userId)) && !(await canAccessLead(user, task.lead))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json(task);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { id } = await params;
  const parsed = await parseBody(req, updateTaskSchema, 'Invalid task update');
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  const task = await prisma.task.findUnique({
    where: { id },
    include: { lead: true },
  });
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await canAccessUser(user, task.userId)) && !(await canAccessLead(user, task.lead))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let updated;
  if (body.status === 'completed' || body.status === 'skipped') {
    const updateResult = await prisma.task.updateMany({
      where: { id, status: 'pending' },
      data: {
        status: body.status,
        completedAt: body.status === 'completed' ? new Date() : null,
        ...(body.dueDate !== undefined && { dueDate: body.dueDate }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.outcome !== undefined && { outcome: body.outcome }),
      },
    });

    if (updateResult.count === 0) {
      const checkTask = await prisma.task.findUnique({ where: { id } });
      if (!checkTask) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Task is already completed or skipped' }, { status: 409 });
    }

    updated = await prisma.task.findUnique({
      where: { id },
      include: { lead: true },
    });
  } else {
    updated = await prisma.task.update({
      where: { id },
      data: {
        ...(body.dueDate !== undefined && { dueDate: body.dueDate }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.outcome !== undefined && { outcome: body.outcome }),
      },
      include: { lead: true },
    });
  }

  // Auto-log activity when task is completed or skipped
  if (body.status === 'completed' || body.status === 'skipped') {
    const activityTypeMap: Record<string, string> = {
      email: 'email_task_completed',
      phone: 'call_logged',
      linkedin: 'linkedin_touch',
      whatsapp: 'whatsapp_message',
      manual: 'task_completed',
    };

    await prisma.activity.create({
      data: {
        userId: user.id,
        leadId: task.leadId,
        type:
          body.status === 'skipped'
            ? ('task_skipped' as any)
            : (activityTypeMap[task.type] as any),
        channel: task.type !== 'manual' ? (task.type as any) : null,
        description:
          body.status === 'skipped'
            ? `Skipped task: "${task.title}"`
            : `Completed ${task.type} task: "${task.title}"`,
        metadata: {
          outcome: body.outcome,
          notes: body.notes,
          taskTitle: task.title,
        },
      },
    });

    // Update lead lastContactedAt for outreach tasks
    if (['email', 'phone', 'linkedin', 'whatsapp'].includes(task.type)) {
      await prisma.lead.update({
        where: { id: task.leadId },
        data: { lastContactedAt: new Date() },
      });
    }

    // Callback requested → auto-create a follow-up phone task next business day (SKILL.md §21)
    if (body.outcome === 'callback_requested' && task.type === 'phone') {
      await prisma.task.create({
        data: {
          leadId: task.leadId,
          userId: task.userId,
          type: 'phone',
          title: `Callback: ${task.lead.firstName} ${task.lead.lastName}`,
          description: 'Callback requested on previous call',
          dueDate: nextBusinessDay(new Date()),
          priority: 'high',
        },
      });
    }

    // Advance sequence step when a sequence task is completed
    if (body.status === 'completed') {
      await advanceSequence(task, user.id);
    }
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { id } = await params;

  const existing = await prisma.task.findUnique({
    where: { id },
    select: { userId: true, lead: { select: { assignedToId: true, campaignId: true } } },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!(await canAccessUser(user, existing.userId)) && !(await canAccessLead(user, existing.lead))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
