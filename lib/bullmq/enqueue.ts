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
  const jobRun = await tenantStorage.run({ tenantId, bypassRls: true }, async () => {
    return prisma.jobRun.upsert({
      where: { dedupeKey },
      create: {
        queueName: jobQueue(jobType),
        jobName: jobType,
        dedupeKey,
        status: 'queued',
        tenantId,
        maxAttempts: jobOptions.attempts || 3,
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

  const resolvedJobId = opts.jobId || jobRun.id;

  await queue.add(jobType, payload, {
    ...jobOptions,
    jobId: resolvedJobId,
  });

  return resolvedJobId;
}
