import crypto from 'node:crypto';
import type { JobsOptions } from 'bullmq';
import { jobQueue, type JobPayload, type JobType } from './types';
import { DEFAULT_JOB_OPTIONS, JOB_OPTIONS } from './jobOptions';
import { sequenceQueue, emailQueue, importQueue, syncQueue, maintenanceQueue } from './queues';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { tenantStorage } from '@/lib/tenant-context';

function resolveQueue(jobType: JobType) {
  const queueName = jobQueue(jobType);
  switch (queueName) {
    case 'sequence': return sequenceQueue();
    case 'email': return emailQueue();
    case 'import': return importQueue();
    case 'sync': return syncQueue();
    case 'maintenance': return maintenanceQueue();
  }
}

function buildDedupeKey(tenantId: string, jobType: JobType, payload: Record<string, unknown>): string {
  const stable = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash('sha256').update(`${tenantId}:${jobType}:${stable}`).digest('hex');
}

export interface EnqueueOptions {
  delay?: number;
  dedupeKey?: string;
  jobId?: string;
  priority?: number;
  tenantId?: string;
}

/**
 * Upsert the durable JobRun mirror for a (dedupeKey, jobType, tenant). Resetting an
 * existing row back to 'queued' clears prior execution stats so the UI reflects a fresh run.
 * Shared by `enqueue` and `enqueueImmediate`.
 */
async function upsertJobRun(
  dedupeKey: string,
  jobType: JobType,
  tenantId: string,
  maxAttempts: number,
) {
  return tenantStorage.run({ tenantId, bypassRls: true }, async () => {
    return prisma.jobRun.upsert({
      where: { dedupeKey },
      create: {
        queueName: jobQueue(jobType),
        jobName: jobType,
        dedupeKey,
        status: 'queued',
        tenantId,
        maxAttempts,
      },
      update: {
        status: 'queued',
        attempts: 0,
        enqueuedAt: new Date(),
        startedAt: null,
        completedAt: null,
        failedReason: null,
        result: Prisma.DbNull,
        progress: Prisma.DbNull,
      },
    });
  });
}

export async function enqueue<T extends JobType>(
  jobType: T,
  payload: JobPayload[T],
  opts: EnqueueOptions = {},
): Promise<string> {
  const queue = resolveQueue(jobType);
  const tenantId = opts.tenantId || 'default-tenant';
  const dedupeKey = opts.dedupeKey || buildDedupeKey(tenantId, jobType, payload as Record<string, unknown>);

  const jobOptions: JobsOptions = {
    ...DEFAULT_JOB_OPTIONS,
    ...JOB_OPTIONS[jobType],
    delay: opts.delay,
    priority: opts.priority,
    deduplication: {
      id: dedupeKey,
      ttl: 86400 * 7,
    },
  };
  if (opts.jobId) {
    jobOptions.deduplication = undefined;
  }

  // 1. Create or update the JobRun record in Postgres to track progress durable mirror
  const jobRun = await upsertJobRun(dedupeKey, jobType, tenantId, (jobOptions.attempts as number) || 3);

  const resolvedJobId = opts.jobId || jobRun.id;

  await queue.add(jobType, payload, {
    ...jobOptions,
    jobId: resolvedJobId,
  });

  return resolvedJobId;
}

/**
 * Force a job to run immediately, fast-forwarding any job already scheduled for the same
 * payload. Used by "Send Now" / run-now.
 *
 * Why a plain `enqueue(..., { delay: 0 })` is NOT enough: for an auto-send email step,
 * `createTaskForStep` already enqueued a *delayed* SEQUENCE_EXECUTE_TASK with the SAME
 * payload → same dedupeKey → same JobRun.id → same BullMQ jobId. A second `add` with that
 * jobId is ignored by BullMQ, and the 7-day deduplication window blocks it too, so the
 * original multi-day delay stands and the send never fast-forwards. Here we instead PROMOTE
 * the existing delayed job to run now; if there is no live job (a non-autoComplete step, or
 * it already ran), we add a fresh immediate one. Either way we keep the
 * `JobRun.id == jobId` invariant that `wrapProcessor` relies on to resolve tenant/lifecycle.
 *
 * Idempotency: the SEQUENCE_EXECUTE_TASK handler re-checks task status and CAS-locks before
 * sending, so a stray duplicate can never double-send.
 */
export async function enqueueImmediate<T extends JobType>(
  jobType: T,
  payload: JobPayload[T],
  opts: { tenantId?: string } = {},
): Promise<string> {
  const queue = resolveQueue(jobType);
  const tenantId = opts.tenantId || 'default-tenant';
  const dedupeKey = buildDedupeKey(tenantId, jobType, payload as Record<string, unknown>);

  const attempts = (JOB_OPTIONS[jobType]?.attempts as number) ?? (DEFAULT_JOB_OPTIONS.attempts as number) ?? 3;
  const jobRun = await upsertJobRun(dedupeKey, jobType, tenantId, attempts);
  const jobId = jobRun.id;

  // Reschedule the existing job for this exact payload instead of colliding with it.
  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === 'delayed') {
      await existing.promote(); // move delayed → waiting so a worker picks it up now
      return jobId;
    }
    // Already waiting/active/prioritized → it will run imminently; nothing to do.
    if (state !== 'completed' && state !== 'failed') {
      return jobId;
    }
    // Terminal job still occupying the id → remove so we can add a fresh run.
    await existing.remove();
  }

  // No live job to promote → add a fresh immediate one. No `deduplication` here so a lingering
  // dedup key from the original delayed add can't drop it.
  const jobOptions: JobsOptions = {
    ...DEFAULT_JOB_OPTIONS,
    ...JOB_OPTIONS[jobType],
    delay: 0,
  };
  await queue.add(jobType, payload, { ...jobOptions, jobId });

  return jobId;
}
