import { createHash } from 'crypto';
import type { JobsOptions } from 'bullmq';
import { JobType } from './types';

export function generateIdempotencyKey(leadId: string, accountId: string, subject: string): string {
  return createHash('sha256').update(`${leadId}:${accountId}:${subject}`).digest('hex').slice(0, 64);
}

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
  removeOnComplete: {
    age: 86400 * 3,
    count: 500,
  },
  removeOnFail: {
    age: 86400 * 7,
    count: 100,
  },
};

export const JOB_OPTIONS: Partial<Record<JobType, JobsOptions>> = {
  [JobType.EMAIL_SEND]: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 86400 * 7, count: 1000 },
    removeOnFail: { age: 86400 * 14, count: 500 },
  },
  [JobType.SEQUENCE_ENROLL]: {
    attempts: 3,
    backoff: { type: 'fixed', delay: 3000 },
  },
  [JobType.SEQUENCE_ADVANCE]: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  },
  [JobType.SEQUENCE_EXECUTE_TASK]: {
    // Safe to retry: the handler re-checks task status and CAS-locks before sending.
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
  [JobType.IMPORT_PARSE]: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 5000 },
  },
  [JobType.IMPORT_CHUNK]: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  },
  [JobType.MAINTENANCE_HEALTHCHECK]: {
    attempts: 1,
    removeOnComplete: { age: 86400, count: 50 },
    removeOnFail: { age: 86400 * 3, count: 50 },
  },
  [JobType.MAINTENANCE_REPAIR]: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 10000 },
  },
  [JobType.EMAIL_SYNC]: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
  [JobType.EMAIL_APPLY_REPLY]: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
  },
  [JobType.EMAIL_APPLY_BOUNCE]: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
  },
  [JobType.IMPORT_COMMIT]: {
    attempts: 3,
    backoff: { type: 'fixed', delay: 5000 },
  },
  [JobType.REMINDER_DUE]: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 5000 },
  },
  [JobType.DIGEST_DAILY]: {
    attempts: 1,
    removeOnComplete: { age: 86400, count: 100 },
    removeOnFail: { age: 86400 * 3, count: 50 },
  },
};
