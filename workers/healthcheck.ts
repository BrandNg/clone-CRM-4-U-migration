import { Worker } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { createAppWorker } from '@/lib/bullmq';
import { getConnection } from '@/lib/bullmq/connection';

export function createHealthcheckWorker(): Worker {
  return createAppWorker(
    'maintenance',
    async (job) => {
      if (job.name !== 'maintenance.healthcheck') return;

      const startedAt = job.data.startedAt;
      const redisOk = await getConnection().ping().catch(() => null);

      let dbOk = false;
      try {
        await prisma.$queryRaw`SELECT 1`;
        dbOk = true;
      } catch {
        dbOk = false;
      }

      const elapsed = Date.now() - new Date(startedAt).getTime();

      await job.updateProgress({
        redis: redisOk === 'PONG' ? 'ok' : 'fail',
        database: dbOk ? 'ok' : 'fail',
        elapsedMs: elapsed,
      });

      console.log(`[worker:healthcheck] redis=${redisOk === 'PONG' ? 'OK' : 'FAIL'} db=${dbOk ? 'OK' : 'FAIL'} ${elapsed}ms`);
      return { success: true, elapsedMs: elapsed };
    },
    { concurrency: 1 }
  );
}

export async function closeHealthcheck(): Promise<void> {
  // Global prisma client connection is managed by standard app lifecycle
}
