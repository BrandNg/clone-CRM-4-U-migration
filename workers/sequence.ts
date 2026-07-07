import { prisma } from '@/lib/prisma';
import { createAppWorker } from '@/lib/bullmq';
import { JobType } from '@/lib/bullmq/types';
import type {
  SequenceEnrollPayload,
  SequenceAdvancePayload,
  SequencePausePayload,
  SequenceUnenrollPayload,
  SequenceRebuildPayload,
  SequenceExecuteTaskPayload,
} from '@/lib/bullmq/types';
import {
  createTaskForStep,
  advanceSequence,
  pauseSequence,
  unenrollLead,
} from '@/lib/sequences/engine';
import { renderTemplate } from '@/lib/templates/render';
import { createOutboundMessage, enqueueEmailSendWorkflow } from '@/lib/workflows/email';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

// Exported for testing
export async function handleEnroll(payload: SequenceEnrollPayload) {
  const { leadId, sequenceId, userId } = payload;

  const [lead, sequence] = await Promise.all([
    prisma.lead.findUnique({ where: { id: leadId } }),
    prisma.sequence.findUnique({
      where: { id: sequenceId },
      include: { steps: { orderBy: { order: 'asc' } } },
    }),
  ]);

  if (!lead || !sequence || !sequence.isActive || sequence.steps.length === 0) {
    throw new Error(
      `Cannot enroll: lead=${!!lead} sequence=${!!sequence} ` +
      `active=${sequence?.isActive} steps=${sequence?.steps.length}`
    );
  }

  // Unenroll from previous sequence if switching
  if (lead.sequenceId && lead.sequenceId !== sequenceId) {
    const prevSeq = await prisma.sequence.findUnique({
      where: { id: lead.sequenceId },
      select: { name: true },
    });
    await unenrollLead(leadId, lead.sequenceId);
    await prisma.activity.create({
      data: {
        userId, leadId,
        type: 'sequence_unenrolled',
        description: `Unenrolled from ${prevSeq?.name ?? lead.sequenceId} (switched to ${sequence.name})`,
        metadata: { sequenceId: lead.sequenceId },
      },
    });
  }

  // Close any prior active enrollments
  await prisma.sequenceEnrollment.updateMany({
    where: { leadId, status: 'active' },
    data: { status: 'unenrolled', completedAt: new Date() },
  });

  // Create new enrollment
  await prisma.sequenceEnrollment.create({
    data: {
      leadId, sequenceId,
      status: 'active', currentStep: 1,
      tenantId: lead.tenantId,
    },
  });

  // Re-fetch lead for fresh assignedToId/crmPriorityScore
  const freshLead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { assignedToId: true, crmPriorityScore: true },
  });

  // Create first step task BEFORE updating lead (so task failure doesn't leave lead in "enrolled with no task" state)
  await createTaskForStep(
    { id: leadId, assignedToId: freshLead?.assignedToId ?? lead.assignedToId, crmPriorityScore: freshLead?.crmPriorityScore ?? lead.crmPriorityScore },
    sequence,
    sequence.steps[0],
    new Date()
  );

  // Update lead
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      sequenceId, sequenceStep: 1, sequenceStatus: 'active',
      ...(lead.stage === 'new' ? { stage: 'sequence_active' } : {}),
    },
  });

  // Log enroll activity
  await prisma.activity.create({
    data: {
      userId, leadId,
      type: 'sequence_enrolled',
      description: `Enrolled in ${sequence.name}`,
      metadata: { sequenceId, sequenceName: sequence.name },
    },
  });

  return { success: true, leadId, sequenceId };
}

export async function handleAdvance(payload: SequenceAdvancePayload) {
  const { leadId, sequenceId, currentStep } = payload;

  const enrollment = await prisma.sequenceEnrollment.findFirst({
    where: { leadId, sequenceId, status: 'active' },
  });
  if (!enrollment) {
    return { skipped: true, reason: 'no_active_enrollment' };
  }

  // CAS: skip if lead already advanced past this step
  const leadCheck = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { sequenceStep: true },
  });
  if (leadCheck && leadCheck.sequenceStep !== null && leadCheck.sequenceStep > currentStep) {
    return { skipped: true, reason: 'stale_step' };
  }

  // Delegate to engine for lead advancement and task creation
  await advanceSequence(
    { leadId, sequenceId, sequenceStep: currentStep },
    SYSTEM_USER_ID
  );

  // Sync enrollment state after engine execution
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { sequenceId: true, sequenceStep: true },
  });

  if (!lead?.sequenceId) {
    // Engine completed the sequence (cleared lead fields)
    await prisma.sequenceEnrollment.update({
      where: { id: enrollment.id },
      data: { status: 'completed', currentStep, completedAt: new Date() },
    });
    return { status: 'completed', leadId, sequenceId };
  }

  await prisma.sequenceEnrollment.update({
    where: { id: enrollment.id },
    data: { currentStep: lead.sequenceStep ?? currentStep },
  });

  return { status: 'active', currentStep: lead.sequenceStep, leadId, sequenceId };
}

export async function handlePause(payload: SequencePausePayload) {
  const { leadId, reason, userId } = payload;

  const enrollment = await prisma.sequenceEnrollment.findFirst({
    where: { leadId, status: 'active' },
    select: { id: true, sequenceId: true },
  });
  if (!enrollment) {
    return { skipped: true, reason: 'no_active_enrollment' };
  }

  await pauseSequence(leadId, reason, userId);

  await prisma.sequenceEnrollment.update({
    where: { id: enrollment.id },
    data: { status: 'paused' },
  });

  return { success: true, leadId, sequenceId: enrollment.sequenceId, reason };
}

export async function handleUnenroll(payload: SequenceUnenrollPayload) {
  const { leadId, sequenceId } = payload;

  await prisma.sequenceEnrollment.updateMany({
    where: { leadId, sequenceId, status: { in: ['active', 'paused'] } },
    data: { status: 'unenrolled', completedAt: new Date() },
  });

  await unenrollLead(leadId, sequenceId);

  return { success: true, leadId, sequenceId };
}

export async function handleRebuild(payload: SequenceRebuildPayload) {
  const { sequenceId } = payload;

  // Validate the sequence still exists before any rebuild work re-enqueues its jobs.
  const sequence = await prisma.sequence.findUnique({
    where: { id: sequenceId },
    select: { id: true },
  });
  if (!sequence) {
    throw new Error(`Sequence not found: ${sequenceId}`);
  }

  return { success: true, sequenceId };
}

/**
 * Delayed execution of an automated sequence email task at its due date.
 * Ported from the former Inngest `executeScheduledTask`. The worker already runs inside
 * the job's tenant context (wrapProcessor resolves it from the JobRun), so this reads/
 * writes scoped to the right tenant without any manual tenantStorage juggling.
 */
export async function handleExecuteTask(payload: SequenceExecuteTaskPayload) {
  const { taskId } = payload;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      lead: {
        include: {
          assignedTo: { select: { id: true, firstName: true, lastName: true, role: true } },
        },
      },
    },
  });

  if (!task) return { status: 'ignored', reason: 'task_not_found' };
  if (task.status !== 'pending') return { status: 'ignored', reason: `task_status_is_${task.status}` };

  // Only automate autoComplete email tasks generated by sequences.
  const isAutoEmail = task.type === 'email' && task.sequenceId !== null;
  if (!isAutoEmail) return { status: 'manual_action_required', type: task.type };

  // Eligibility: step still auto/email + template present + lead still actively enrolled + sendable email.
  const stepInfo = await prisma.sequenceStep.findFirst({
    where: { sequenceId: task.sequenceId!, order: task.sequenceStep ?? -1 },
    include: { template: { include: { abVariants: true } } },
  });

  const leadEmail = task.lead.email;
  const eligible =
    stepInfo?.autoComplete &&
    stepInfo.channel === 'email' &&
    stepInfo.template &&
    task.lead.sequenceId === task.sequenceId &&
    task.lead.sequenceStatus === 'active' &&
    !task.lead.emailInvalid &&
    leadEmail;

  if (!eligible || !stepInfo?.template || !leadEmail) {
    return { status: 'skipped', reason: 'lead_ineligible_or_paused' };
  }
  const template = stepInfo.template;

  // Sending mailbox.
  const account = await prisma.emailAccount.findFirst({
    where: { userId: task.lead.assignedToId, isActive: true },
  });
  if (!account) return { status: 'failed', reason: 'no_active_mailbox_connected' };

  // CAS concurrency lock — only one runner proceeds past here.
  const lock = await prisma.task.updateMany({
    where: { id: task.id, status: 'pending' },
    data: { lockedAt: new Date() },
  });
  if (lock.count !== 1) return { status: 'ignored', reason: 'concurrency_lock_failed' };

  // Render body, picking an A/B variant only when both A and B exist.
  let subject: string;
  let body: string;
  let selectedVariantId: string | null = null;
  const variantA = template.abVariants?.find((v) => v.version === 'A');
  const variantB = template.abVariants?.find((v) => v.version === 'B');
  if (variantA && variantB) {
    const selected = Math.random() < 0.5 ? variantA : variantB;
    subject = renderTemplate(selected.subject ?? template.subject ?? '', task.lead, task.lead.assignedTo);
    body = renderTemplate(selected.body ?? template.body, task.lead, task.lead.assignedTo);
    selectedVariantId = selected.id;
  } else {
    subject = renderTemplate(template.subject ?? '', task.lead, task.lead.assignedTo);
    body = renderTemplate(template.body, task.lead, task.lead.assignedTo);
  }

  // OutboundMessage (idempotent) + enqueue the actual provider send.
  const outbound = await createOutboundMessage({
    leadId: task.lead.id,
    accountId: account.id,
    templateId: template.id,
    to: leadEmail,
    subject,
    body,
    tenantId: task.tenantId,
  });
  await enqueueEmailSendWorkflow(
    {
      outboundMessageId: outbound.id,
      accountId: account.id,
      to: leadEmail,
      subject,
      body,
      leadId: task.lead.id,
      templateId: template.id,
    },
    task.tenantId,
  );

  // Complete the task, bump counters, advance the sequence.
  await prisma.task.update({
    where: { id: task.id },
    data: { status: 'completed', completedAt: new Date() },
  });
  if (selectedVariantId) {
    await prisma.abTestVariant.update({
      where: { id: selectedVariantId },
      data: { sentCount: { increment: 1 } },
    });
  }
  await prisma.lead.update({
    where: { id: task.leadId },
    data: { emailSentCount: { increment: 1 } },
  });
  await advanceSequence(task, task.lead.assignedToId);

  return { status: 'completed', taskId: task.id };
}

export function createSequenceWorker() {
  return createAppWorker(
    'sequence',
    async (job) => {
      switch (job.name) {
        case JobType.SEQUENCE_ENROLL:
          return handleEnroll(job.data as SequenceEnrollPayload);
        case JobType.SEQUENCE_ADVANCE:
          return handleAdvance(job.data as SequenceAdvancePayload);
        case JobType.SEQUENCE_PAUSE:
          return handlePause(job.data as SequencePausePayload);
        case JobType.SEQUENCE_UNENROLL:
          return handleUnenroll(job.data as SequenceUnenrollPayload);
        case JobType.SEQUENCE_REBUILD:
          return handleRebuild(job.data as SequenceRebuildPayload);
        case JobType.SEQUENCE_EXECUTE_TASK:
          return handleExecuteTask(job.data as SequenceExecuteTaskPayload);
        default:
          console.warn('[worker:sequence] unknown job type:', job.name);
      }
    },
    { concurrency: 5 }
  );
}
