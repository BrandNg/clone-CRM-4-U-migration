import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, canAccessUser, canAccessLead } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { handleApiError } from '@/lib/api/errors';
import { enqueueImmediate } from '@/lib/bullmq/enqueue';
import { JobType } from '@/lib/bullmq/types';

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  try {
    const task = await prisma.task.findUnique({
      where: { id: params.id },
      include: {
        lead: { select: { id: true, assignedToId: true, campaignId: true } },
      },
    });

    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    if (task.status !== 'pending') {
      return NextResponse.json({ error: 'Task is not pending' }, { status: 400 });
    }

    // Verify access
    if (task.userId !== user.id && !(await canAccessUser(user, task.userId))) {
      return NextResponse.json({ error: 'Forbidden access to task user' }, { status: 403 });
    }
    if (!(await canAccessLead(user, task.lead))) {
      return NextResponse.json({ error: 'Forbidden access to lead' }, { status: 403 });
    }

    // Update due date to now so UI reflects it immediately
    await prisma.task.update({
      where: { id: task.id },
      data: { dueDate: new Date() },
    });

    // Enqueue immediate execution — promotes the already-scheduled delayed job so the
    // send actually fast-forwards (a plain enqueue would collide with it and be dropped).
    await enqueueImmediate(
      JobType.SEQUENCE_EXECUTE_TASK,
      { taskId: task.id },
      { tenantId: user.tenantId! }
    );

    return NextResponse.json({ success: true, taskId: task.id }, { status: 200 });
  } catch (err) {
    return handleApiError('api/tasks/[id]/run-now POST', err);
  }
}
