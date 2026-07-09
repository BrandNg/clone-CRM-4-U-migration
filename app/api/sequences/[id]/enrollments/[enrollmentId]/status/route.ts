import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { pauseSequence, createTaskForStep } from '@/lib/sequences/engine';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; enrollmentId: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { id: sequenceId, enrollmentId } = await params;

  try {
    const { status } = await req.json();

    if (status !== 'active' && status !== 'paused') {
      return NextResponse.json({ error: 'Invalid status. Must be active or paused' }, { status: 400 });
    }

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

    if (status === 'paused') {
      if (enrollment.status === 'paused') {
        return NextResponse.json({ error: 'Already paused' }, { status: 400 });
      }

      // 1. Pause sequence using engine (skips pending tasks, sets status in DB)
      await pauseSequence(enrollment.leadId, 'manual', user.id);

      // 2. Set enrollment status
      const updated = await prisma.sequenceEnrollment.update({
        where: { id: enrollmentId },
        data: { status: 'paused' },
        include: {
          lead: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              company: true,
              tasks: {
                where: { sequenceId, status: 'pending' },
                select: { id: true, dueDate: true, type: true }
              }
            }
          }
        }
      });

      return NextResponse.json(updated);
    } else {
      // Resume
      if (enrollment.status === 'active') {
        return NextResponse.json({ error: 'Already active' }, { status: 400 });
      }

      // 1. Set lead status active
      await prisma.lead.update({
        where: { id: enrollment.leadId },
        data: { sequenceStatus: 'active' },
      });

      // 2. Set enrollment active
      await prisma.sequenceEnrollment.update({
        where: { id: enrollmentId },
        data: { status: 'active' },
      });

      // 3. Find the sequence step
      const sequence = await prisma.sequence.findUnique({
        where: { id: sequenceId },
        include: { steps: true },
      });

      const step = sequence?.steps.find((s) => s.order === enrollment.currentStep);
      
      if (step && sequence) {
        // Re-create the task for the current step (due relative to now)
        await createTaskForStep(enrollment.lead, sequence, step, new Date());
      }

      const updated = await prisma.sequenceEnrollment.findUnique({
        where: { id: enrollmentId },
        include: {
          lead: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              company: true,
              tasks: {
                where: { sequenceId, status: 'pending' },
                select: { id: true, dueDate: true, type: true }
              }
            }
          }
        }
      });

      return NextResponse.json(updated);
    }
  } catch (error) {
    console.error('[sequence-status-patch] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
