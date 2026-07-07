import { prisma } from '@/lib/prisma';
import { snapToBusinessDay } from '@/lib/dates/businessDays';
import type { Lead, Sequence, SequenceStep, Task } from '@prisma/client';
import { enqueue } from '@/lib/bullmq/enqueue';
import { JobType } from '@/lib/bullmq/types';

/**
 * Sequence execution engine (SKILL.md §3).
 *
 * Sequences drive the daily task list: enrolling a lead creates the step-1
 * task, completing a sequence task creates the task for the next step, and
 * replies/bounces/stage milestones pause or end the run. All writes are
 * plain single statements — the Neon HTTP driver does not support
 * interactive transactions, so nothing here may use prisma.$transaction.
 */

const PRIORITY_MAP = { hot: 'high', warm: 'medium', cold: 'low' } as const;

export function computeStepDueDate(base: Date, step: Pick<SequenceStep, 'delayDays' | 'delayHours'>): Date {
  const due = new Date(base.getTime() + step.delayDays * 86_400_000 + step.delayHours * 3_600_000);
  return snapToBusinessDay(due);
}

/** Create the task for one sequence step and update the lead's nextTaskDue. */
export async function createTaskForStep(
  lead: Pick<Lead, 'id' | 'assignedToId' | 'crmPriorityScore'>,
  sequence: Pick<Sequence, 'id' | 'name'>,
  step: SequenceStep,
  baseDate: Date
): Promise<Task> {
  const dueDate = computeStepDueDate(baseDate, step);
  const channelLabel = step.channel.charAt(0).toUpperCase() + step.channel.slice(1);

  const task = await prisma.task.create({
    data: {
      leadId: lead.id,
      userId: lead.assignedToId,
      type: step.channel,
      title: `Step ${step.order}: ${channelLabel} — ${sequence.name}`,
      description: step.instructions ?? null,
      dueDate,
      sequenceId: sequence.id,
      sequenceStep: step.order,
      priority: PRIORITY_MAP[lead.crmPriorityScore],
    },
  });

  await prisma.lead.update({
    where: { id: lead.id },
    data: { nextTaskDue: dueDate },
  });

  // Schedule delayed execution on the BullMQ SEQUENCE queue for automated email steps.
  // The JobRun durable mirror makes this rebuildable from the DB (maintenance worker's
  // `missing-delayed` repair), so a queue blip here must never fail task creation.
  if (task.type === 'email' && step.autoComplete) {
    try {
      const delay = Math.max(0, dueDate.getTime() - Date.now());
      await enqueue(
        JobType.SEQUENCE_EXECUTE_TASK,
        { taskId: task.id },
        { delay, tenantId: task.tenantId },
      );
    } catch (err) {
      console.error(`[createTaskForStep] Failed to schedule execution for task ${task.id}:`, err);
    }
  }

  return task;
}

/**
 * Advance a lead to the next sequence step after a sequence task completes.
 * Unenrolls + notifies when the final step is done; otherwise increments
 * sequenceStep and creates the next task (due relative to now).
 */
export async function advanceSequence(
  task: Pick<Task, 'leadId' | 'sequenceId' | 'sequenceStep'>,
  actorUserId: string
): Promise<void> {
  if (!task.sequenceId || task.sequenceStep === null || task.sequenceStep === undefined) return;

  const lead = await prisma.lead.findUnique({
    where: { id: task.leadId },
    select: {
      id: true, sequenceId: true, sequenceStep: true, sequenceStatus: true,
      assignedToId: true, firstName: true, lastName: true, crmPriorityScore: true,
    },
  });
  if (!lead || lead.sequenceId !== task.sequenceId) return;

  const sequence = await prisma.sequence.findUnique({
    where: { id: task.sequenceId },
    include: { steps: { orderBy: { order: 'asc' } } },
  });
  if (!sequence) return;

  const totalSteps = sequence.steps.length;
  const nextStepOrder = (lead.sequenceStep ?? task.sequenceStep) + 1;

  // Don't queue further work while paused (reply/bounce); resume re-creates it
  if (lead.sequenceStatus === 'paused') return;

  if (nextStepOrder > totalSteps) {
    // All steps done — unenroll and notify
    await prisma.lead.update({
      where: { id: lead.id },
      data: { sequenceId: null, sequenceStep: null, sequenceStatus: null },
    });
    await prisma.activity.create({
      data: {
        userId: actorUserId,
        leadId: lead.id,
        type: 'sequence_completed',
        description: `Completed all ${totalSteps} steps of "${sequence.name}"`,
        metadata: { sequenceName: sequence.name, totalSteps },
      },
    });
    if (lead.assignedToId) {
      await prisma.notification.create({
        data: {
          userId: lead.assignedToId,
          type: 'sequence_completed',
          title: 'Sequence Completed',
          text: `${lead.firstName} ${lead.lastName} completed all ${totalSteps} steps in "${sequence.name}".`,
          linkTo: `/leads/${lead.id}`,
        },
      });
    }
    return;
  }

  await prisma.lead.update({
    where: { id: lead.id, sequenceStep: lead.sequenceStep },
    data: { sequenceStep: nextStepOrder },
  });

  const nextStep = sequence.steps.find((s) => s.order === nextStepOrder);
  if (nextStep) {
    await createTaskForStep(lead, sequence, nextStep, new Date());
  }
}

export type PauseReason = 'replied' | 'bounced' | 'meeting_booked';

const PAUSE_DESCRIPTIONS: Record<PauseReason, string> = {
  replied: 'lead replied',
  bounced: 'email bounced',
  meeting_booked: 'meeting booked',
};

/**
 * Pause a lead's sequence run: mark paused, skip its pending sequence tasks,
 * log an activity. Callers create the reason-specific notification/task.
 */
export async function pauseSequence(
  leadId: string,
  reason: PauseReason,
  actorUserId: string
): Promise<void> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, sequenceId: true, firstName: true, lastName: true },
  });
  if (!lead?.sequenceId) return;

  await prisma.lead.update({
    where: { id: leadId },
    data: { sequenceStatus: 'paused' },
  });

  await prisma.task.updateMany({
    where: { leadId, sequenceId: lead.sequenceId, status: 'pending' },
    data: { status: 'skipped' },
  });

  const sequence = await prisma.sequence.findUnique({
    where: { id: lead.sequenceId },
    select: { name: true },
  });

  // No dedicated "paused" ActivityType in the enum — record it as a sequence_unenrolled
  // activity with `paused: true` in metadata so the feed/analytics can distinguish it.
  await prisma.activity.create({
    data: {
      userId: actorUserId,
      leadId,
      type: 'sequence_unenrolled',
      description: `Sequence "${sequence?.name ?? lead.sequenceId}" paused — ${PAUSE_DESCRIPTIONS[reason]}`,
      metadata: { sequenceId: lead.sequenceId, reason, paused: true },
    },
  });
}

/**
 * Fully unenroll a lead (stage milestones, manual unenroll, sequence switch):
 * clear enrollment fields and skip any pending sequence tasks.
 */
export async function unenrollLead(leadId: string, sequenceId: string): Promise<void> {
  await prisma.lead.update({
    where: { id: leadId },
    data: { sequenceId: null, sequenceStep: null, sequenceStatus: null },
  });
  await prisma.task.updateMany({
    where: { leadId, sequenceId, status: 'pending' },
    data: { status: 'skipped' },
  });
}
