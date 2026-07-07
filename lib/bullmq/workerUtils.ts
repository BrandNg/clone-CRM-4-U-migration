import { Worker, type Job, type Processor, type ConnectionOptions } from 'bullmq';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { tenantStorage } from '@/lib/tenant-context';
import { getConnection } from './connection';

/**
 * Wraps a BullMQ processor to automatically handle the JobRun lifecycle.
 * Every wrapped processor will:
 * 1. Fetch the JobRun from the database to resolve its tenant context.
 * 2. Update the JobRun status to 'active', startedAt, and attempts count.
 * 3. Override job.updateProgress to automatically sync progress to the JobRun in Postgres.
 * 4. Run the actual processor inside a tenantStorage context with RLS bypassed.
 * 5. Update the JobRun status to 'completed' (with results) or 'failed' (with error message).
 */
export function wrapProcessor<T = any, R = any>(
  processor: (job: Job<T, R>) => Promise<R>
): Processor<T, R> {
  return async (job: Job<T, R>) => {
    // BullMQ job ID corresponds to our JobRun ID
    const jobRunId = job.id;
    if (!jobRunId) {
      // Fallback if no job ID: run processor directly
      return processor(job);
    }

    // Resolve tenantId by reading the JobRun record
    let tenantId = 'default-tenant';
    try {
      // We must bypass RLS when looking up the JobRun, since we don't know the tenant yet
      const jobRun = await tenantStorage.run({ tenantId: 'default-tenant', bypassRls: true }, () =>
        prisma.jobRun.findUnique({ where: { id: jobRunId } })
      );
      if (jobRun) {
        tenantId = jobRun.tenantId;
      }
    } catch (err) {
      console.error(`[worker] Failed to resolve tenant for job ${job.id}:`, err);
    }

    // Run lifecycle updates & execution in the context of the job's tenant
    return tenantStorage.run({ tenantId, bypassRls: true }, async () => {
      // 1. Mark as active
      try {
        await prisma.jobRun.update({
          where: { id: jobRunId },
          data: {
            status: 'active',
            startedAt: new Date(),
            attempts: job.attemptsMade,
          },
        });
      } catch (err) {
        console.error(`[worker] Failed to set active state for job ${job.id}:`, err);
      }

      // Override job.updateProgress to save progress in the database as well
      const originalUpdateProgress = job.updateProgress.bind(job);
      job.updateProgress = async (value: any) => {
        await originalUpdateProgress(value);
        try {
          await prisma.jobRun.update({
            where: { id: jobRunId },
            data: {
              progress: typeof value === 'object' ? value : { value },
            },
          });
        } catch (err) {
          console.error(`[worker] Failed to sync progress to database for job ${job.id}:`, err);
        }
      };

      try {
        const result = await processor(job);

        // 2. Mark as completed
        try {
          await prisma.jobRun.update({
            where: { id: jobRunId },
            data: {
              status: 'completed',
              completedAt: new Date(),
              result:
                result !== undefined
                  ? ((typeof result === 'object' ? result : { value: result }) as Prisma.InputJsonValue)
                  : Prisma.DbNull,
            },
          });
        } catch (err) {
          console.error(`[worker] Failed to set completed state for job ${job.id}:`, err);
        }

        return result;
      } catch (error: any) {
        // 3. Mark as failed
        try {
          await prisma.jobRun.update({
            where: { id: jobRunId },
            data: {
              status: 'failed',
              completedAt: new Date(),
              failedReason: error.message || String(error),
            },
          });
        } catch (err) {
          console.error(`[worker] Failed to set failed state for job ${job.id}:`, err);
        }

        throw error;
      }
    });
  };
}

/** Helper to create a worker that automatically wraps its processor */
export function createAppWorker<T = any, R = any>(
  queueName: string,
  processor: (job: Job<T, R>) => Promise<R>,
  opts: { concurrency?: number } = {}
): Worker<T, R> {
  return new Worker<T, R>(
    queueName,
    wrapProcessor(processor),
    {
      connection: getConnection() as unknown as ConnectionOptions,
      concurrency: opts.concurrency ?? 1,
    }
  );
}
