import type { Queue } from 'bullmq';

export function attachQueueEvents(queue: Queue, label: string): void {
  queue.on('cleaned', (jobs, type) => {
    console.log(`[bullmq:${label}] cleaned ${jobs.length} ${type} jobs`);
  });
  queue.on('error', (err) => {
    console.error(`[bullmq:${label}] error:`, err.message);
  });
  queue.on('paused', () => {
    console.warn(`[bullmq:${label}] paused`);
  });
  queue.on('resumed', () => {
    console.log(`[bullmq:${label}] resumed`);
  });
}

export async function logQueueStats(queue: Queue, label: string): Promise<void> {
  try {
    const counts = await queue.getJobCounts();
    console.log(
      `[bullmq:${label}] waiting=${counts.waiting ?? 0} active=${counts.active ?? 0} ` +
      `delayed=${counts.delayed ?? 0} failed=${counts.failed ?? 0} completed=${counts.completed ?? 0}`,
    );
  } catch {
    // stats are best-effort
  }
}
