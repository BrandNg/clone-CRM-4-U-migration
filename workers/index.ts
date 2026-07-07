import { Worker } from 'bullmq';
import { getConnection, closeConnection } from '@/lib/bullmq/connection';
import { closeAllQueues } from '@/lib/bullmq/queues';
import { createHealthcheckWorker, closeHealthcheck } from './healthcheck';
import { createSequenceWorker } from './sequence';
import { createEmailWorker } from './email';
import { createNotificationWorker } from './notification';
import { createMaintenanceWorker } from './maintenance';
import { createSyncWorker } from './sync';
import { createImportWorker } from './import';

const workers: Worker[] = [];

function registerWorkers(): void {
  const healthcheck = createHealthcheckWorker();
  workers.push(healthcheck);
  console.log('[worker] registered: healthcheck');

  const sequence = createSequenceWorker();
  workers.push(sequence);
  console.log('[worker] registered: sequence');

  const email = createEmailWorker();
  workers.push(email);
  console.log('[worker] registered: email');

  const notification = createNotificationWorker();
  workers.push(notification);
  console.log('[worker] registered: notification');

  const maintenance = createMaintenanceWorker();
  workers.push(maintenance);
  console.log('[worker] registered: maintenance');

  const sync = createSyncWorker();
  workers.push(sync);
  console.log('[worker] registered: sync');

  const importWorker = createImportWorker();
  workers.push(importWorker);
  console.log('[worker] registered: import');
}

function attachSignals(): void {
  const shutdown = async (signal: string) => {
    console.log(`[worker] received ${signal}, shutting down...`);
    await Promise.allSettled(workers.map((w) => w.close()));
    await closeHealthcheck();
    await closeAllQueues();
    await closeConnection();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    console.error('[worker] unhandled rejection:', reason);
  });
}

async function main(): Promise<void> {
  console.log('[worker] starting...');
  console.log(`[worker] NODE_ENV=${process.env.NODE_ENV}`);
  console.log(`[worker] REDIS_URL=${process.env.REDIS_URL ? 'set' : 'not set'}`);
  console.log(`[worker] DIRECT_URL=${process.env.DIRECT_URL ? 'set' : 'not set'}`);

  getConnection();
  registerWorkers();
  attachSignals();

  console.log('[worker] ready');
}

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
