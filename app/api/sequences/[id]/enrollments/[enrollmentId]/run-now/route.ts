import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { enqueue } from '@/lib/bullmq/enqueue';
import { JobType } from '@/lib/bullmq/types';
import { advanceSequence } from '@/lib/sequences/engine';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; enrollmentId: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { id: sequenceId, enrollmentId } = await params;

  try {
    const enrollment = await prisma.sequenceEnrollment.findUnique({
      where: { id: enrollmentId },
      include: { lead: true },
    });

    if (!enrollment) {
      return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });
    }

    if (enrollment.tenantId !== user.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (enrollment.status === 'completed' || enrollment.status === 'unenrolled') {
      return NextResponse.json({ error: 'Cannot run a completed or unenrolled sequence' }, { status: 400 });
    }

    // Find the next pending task for this sequence enrollment
    const task = await prisma.task.findFirst({
      where: {
        leadId: enrollment.leadId,
        sequenceId,
        status: 'pending',
      },
      orderBy: { sequenceStep: 'asc' },
    });

    if (!task) {
      return NextResponse.json({ error: 'No pending task found for this sequence step' }, { status: 400 });
    }

    if (task.type === 'email') {
      // 1. Force the task dueDate to now
      await prisma.task.update({
        where: { id: task.id },
        data: { dueDate: new Date() },
      });

      // 2. Enqueue execute workflow with 0 delay (runs instantly on worker)
      await enqueue(
        JobType.SEQUENCE_EXECUTE_TASK,
        { taskId: task.id },
        { delay: 0, tenantId: user.tenantId! }
      );

      return NextResponse.json({ success: true, message: 'Email sequence execution enqueued.' });
    } else {
      // Manual steps (LinkedIn, call) can just be advanced
      await prisma.task.update({
        where: { id: task.id },
        data: { status: 'completed', completedAt: new Date() },
      });

      await advanceSequence(task, user.id);

      return NextResponse.json({ success: true, message: 'Step advanced successfully.' });
    }
  } catch (error) {
    console.error('[sequence-run-now] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
