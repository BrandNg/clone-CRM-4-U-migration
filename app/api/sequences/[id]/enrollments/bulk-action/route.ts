import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { enqueueImmediate } from '@/lib/bullmq/enqueue';
import { JobType } from '@/lib/bullmq/types';
import { pauseSequence, unenrollLead, createTaskForStep } from '@/lib/sequences/engine';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireRole('sdr');
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { enrollmentIds, action } = body;

  if (!Array.isArray(enrollmentIds) || !action) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const enrollments = await prisma.sequenceEnrollment.findMany({
    where: { id: { in: enrollmentIds }, sequenceId: id, tenantId: user.tenantId },
    include: { lead: true }
  });

  let processedCount = 0;

  for (const enr of enrollments) {
    try {
      if (action === 'run-now' && enr.status === 'active') {
        const task = await prisma.task.findFirst({
          where: { leadId: enr.leadId, sequenceId: id, status: 'pending' }
        });
        if (task && task.type === 'email') {
          // Fast forward task
          await prisma.task.update({
            where: { id: task.id },
            data: { dueDate: new Date() }
          });
          await enqueueImmediate(JobType.SEQUENCE_EXECUTE_TASK, { taskId: task.id }, { tenantId: user.tenantId });
          processedCount++;
        }
      } else if (action === 'pause' && enr.status === 'active') {
        await pauseSequence(enr.leadId, 'manual', user.id);
        await prisma.sequenceEnrollment.update({
          where: { id: enr.id },
          data: { status: 'paused' }
        });
        processedCount++;
      } else if (action === 'resume' && enr.status === 'paused') {
        // To resume, we update status to active and create the next task if missing
        await prisma.sequenceEnrollment.update({
          where: { id: enr.id },
          data: { status: 'active' }
        });
        await prisma.lead.update({
          where: { id: enr.leadId },
          data: { sequenceStatus: 'active' }
        });
        const sequence = await prisma.sequence.findUnique({
          where: { id },
          include: { steps: { orderBy: { order: 'asc' } } }
        });
        const currentStep = sequence?.steps.find(s => s.order === enr.currentStep);
        if (currentStep) {
          // recreate task
          await createTaskForStep(
            { id: enr.leadId, assignedToId: enr.lead.assignedToId, crmPriorityScore: enr.lead.crmPriorityScore },
            { id: sequence!.id, name: sequence!.name },
            currentStep,
            new Date()
          );
        }
        await prisma.activity.create({
          data: {
            userId: user.id, leadId: enr.leadId, type: 'sequence_enrolled',
            description: `Sequence resumed`,
            metadata: { sequenceId: id, resumed: true },
            tenantId: user.tenantId
          }
        });
        processedCount++;
      } else if (action === 'unenroll') {
        await unenrollLead(enr.leadId, id);
        await prisma.sequenceEnrollment.update({
          where: { id: enr.id },
          data: { status: 'unenrolled', completedAt: new Date() }
        });
        await prisma.activity.create({
          data: {
            userId: user.id, leadId: enr.leadId, type: 'sequence_unenrolled',
            description: `Manually unenrolled from sequence`,
            metadata: { sequenceId: id, manual: true },
            tenantId: user.tenantId
          }
        });
        processedCount++;
      }
    } catch (err) {
      console.error('Bulk action error on enrollment', enr.id, err);
    }
  }

  return NextResponse.json({ success: true, processedCount });
}
