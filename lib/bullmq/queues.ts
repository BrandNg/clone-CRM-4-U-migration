import { Queue, type ConnectionOptions } from 'bullmq';
import { getConnection } from './connection';
import { QUEUES, type QueueName } from './types';

const queues = new Map<QueueName, Queue>();

function getQueue(name: QueueName): Queue {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: getConnection() as unknown as ConnectionOptions });
    queues.set(name, q);
  }
  return q;
}

export const sequenceQueue = () => getQueue(QUEUES.SEQUENCE);
export const emailQueue = () => getQueue(QUEUES.EMAIL);
export const importQueue = () => getQueue(QUEUES.IMPORT);
export const syncQueue = () => getQueue(QUEUES.SYNC);
export const maintenanceQueue = () => getQueue(QUEUES.MAINTENANCE);

export async function closeAllQueues(): Promise<void> {
  const results = await Promise.allSettled(
    Array.from(queues.values()).map((q) => q.close()),
  );
  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('[bullmq] Error closing queue:', result.reason);
    }
  }
  queues.clear();
}
