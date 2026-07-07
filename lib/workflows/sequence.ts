import { enqueue } from '@/lib/bullmq/enqueue';
import { JobType } from '@/lib/bullmq/types';

/**
 * Starts the sequence enrollment workflow for a lead.
 */
export async function startSequenceEnrollWorkflow(
  leadId: string,
  sequenceId: string,
  userId: string,
  tenantId: string
): Promise<string> {
  return enqueue(
    JobType.SEQUENCE_ENROLL,
    { leadId, sequenceId, userId },
    { tenantId }
  );
}

/**
 * Enqueues a job to advance a lead to the next sequence step.
 */
export async function enqueueSequenceAdvanceWorkflow(
  leadId: string,
  sequenceId: string,
  currentStep: number,
  tenantId: string,
  delayMs?: number
): Promise<string> {
  return enqueue(
    JobType.SEQUENCE_ADVANCE,
    { leadId, sequenceId, currentStep },
    { tenantId, delay: delayMs }
  );
}

/**
 * Enqueues a job to pause a sequence enrollment (e.g. on replied/bounced milestone).
 */
export async function enqueueSequencePauseWorkflow(
  leadId: string,
  reason: 'replied' | 'bounced' | 'meeting_booked',
  userId: string,
  tenantId: string
): Promise<string> {
  return enqueue(
    JobType.SEQUENCE_PAUSE,
    { leadId, reason, userId },
    { tenantId }
  );
}

/**
 * Enqueues a job to unenroll a lead from a sequence.
 */
export async function enqueueSequenceUnenrollWorkflow(
  leadId: string,
  sequenceId: string,
  tenantId: string
): Promise<string> {
  return enqueue(
    JobType.SEQUENCE_UNENROLL,
    { leadId, sequenceId },
    { tenantId }
  );
}
