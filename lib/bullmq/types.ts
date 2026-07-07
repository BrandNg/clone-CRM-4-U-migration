export const QUEUES = {
  SEQUENCE: 'sequence',
  EMAIL: 'email',
  IMPORT: 'import',
  SYNC: 'sync',
  MAINTENANCE: 'maintenance',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export enum JobType {
  SEQUENCE_ENROLL = 'sequence.enroll',
  SEQUENCE_ADVANCE = 'sequence.advance',
  SEQUENCE_PAUSE = 'sequence.pause',
  SEQUENCE_UNENROLL = 'sequence.unenroll',
  SEQUENCE_REBUILD = 'sequence.rebuild',
  SEQUENCE_EXECUTE_TASK = 'sequence.execute-task',
  EMAIL_SEND = 'email.send',
  EMAIL_SYNC = 'email.sync',
  EMAIL_APPLY_REPLY = 'email.apply-reply',
  EMAIL_APPLY_BOUNCE = 'email.apply-bounce',
  IMPORT_PARSE = 'import.parse',
  IMPORT_CHUNK = 'import.chunk',
  IMPORT_COMMIT = 'import.commit',
  REMINDER_DUE = 'reminder.due',
  DIGEST_DAILY = 'digest.daily',
  MAINTENANCE_HEALTHCHECK = 'maintenance.healthcheck',
  MAINTENANCE_REPAIR = 'maintenance.repair',
}

export interface SequenceEnrollPayload {
  leadId: string;
  sequenceId: string;
  userId: string;
}

export interface SequenceAdvancePayload {
  leadId: string;
  sequenceId: string;
  currentStep: number;
}

export interface SequencePausePayload {
  leadId: string;
  reason: 'replied' | 'bounced' | 'meeting_booked';
  userId: string;
}

export interface SequenceUnenrollPayload {
  leadId: string;
  sequenceId: string;
}

export interface SequenceRebuildPayload {
  sequenceId: string;
}

/** Delayed execution of an automated sequence email task at its due date. */
export interface SequenceExecuteTaskPayload {
  taskId: string;
}

export interface EmailSendPayload {
  outboundMessageId: string;
  accountId: string;
  to: string;
  subject: string;
  body: string;
  leadId?: string;
  templateId?: string;
}

export interface EmailSyncPayload {
  accountId: string;
}

export interface EmailApplyReplyPayload {
  providerMessageId: string;
  leadId: string;
  accountId: string;
}

export interface EmailApplyBouncePayload {
  providerMessageId: string;
  leadId: string;
  accountId: string;
  bounceType: 'hard' | 'soft';
}

export type ImportResolution = 'skip' | 'update' | 'import';

export interface ImportParsePayload {
  batchId: string;
  assignedToId: string;
  campaignId: string;
  tenantId: string;
  userId: string;
  initialStage?: string;
  sequenceId?: string;
  defaultResolution?: ImportResolution;
  resolutions?: Record<string, ImportResolution>;
}

export interface ImportChunkPayload {
  batchId: string;
  chunkIndex: number;
  rowIds: string[];
  rows: Record<string, unknown>[];
  assignedToId: string;
  userId: string;
  campaignId: string;
  tenantId: string;
  initialStage: string;
  sequenceId?: string;
}

export interface ImportCommitPayload {
  batchId: string;
}

export interface ReminderDuePayload {
  reminderId: string;
  leadId?: string;
}

export interface DigestDailyPayload {
  userIds?: string[];
}

export interface MaintenanceHealthcheckPayload {
  startedAt: string;
}

export interface MaintenanceRepairPayload {
  types: ('orphan-tasks' | 'stale-sending' | 'stuck-running' | 'missing-delayed' | 'reassignment-drift')[];
}

export type JobPayload = {
  [JobType.SEQUENCE_ENROLL]: SequenceEnrollPayload;
  [JobType.SEQUENCE_ADVANCE]: SequenceAdvancePayload;
  [JobType.SEQUENCE_PAUSE]: SequencePausePayload;
  [JobType.SEQUENCE_UNENROLL]: SequenceUnenrollPayload;
  [JobType.SEQUENCE_REBUILD]: SequenceRebuildPayload;
  [JobType.SEQUENCE_EXECUTE_TASK]: SequenceExecuteTaskPayload;
  [JobType.EMAIL_SEND]: EmailSendPayload;
  [JobType.EMAIL_SYNC]: EmailSyncPayload;
  [JobType.EMAIL_APPLY_REPLY]: EmailApplyReplyPayload;
  [JobType.EMAIL_APPLY_BOUNCE]: EmailApplyBouncePayload;
  [JobType.IMPORT_PARSE]: ImportParsePayload;
  [JobType.IMPORT_CHUNK]: ImportChunkPayload;
  [JobType.IMPORT_COMMIT]: ImportCommitPayload;
  [JobType.REMINDER_DUE]: ReminderDuePayload;
  [JobType.DIGEST_DAILY]: DigestDailyPayload;
  [JobType.MAINTENANCE_HEALTHCHECK]: MaintenanceHealthcheckPayload;
  [JobType.MAINTENANCE_REPAIR]: MaintenanceRepairPayload;
};

export function jobQueue(jobType: JobType): QueueName {
  if (jobType.startsWith('sequence.')) return QUEUES.SEQUENCE;
  if (jobType === JobType.EMAIL_SEND) return QUEUES.EMAIL;
  if (jobType.startsWith('email.')) return QUEUES.SYNC;
  if (jobType.startsWith('import.')) return QUEUES.IMPORT;
  if (jobType.startsWith('reminder.') || jobType.startsWith('digest.')) return QUEUES.SYNC;
  if (jobType.startsWith('maintenance.')) return QUEUES.MAINTENANCE;
  return QUEUES.MAINTENANCE;
}
