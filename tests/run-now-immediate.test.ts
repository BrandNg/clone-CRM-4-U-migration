import { vi, describe, it, expect, beforeEach } from 'vitest';

// In-memory BullMQ job store shared between the mock and the assertions.
// `vi.hoisted` runs before the (hoisted) vi.mock factory, so both can reference it.
const { jobStore } = vi.hoisted(() => ({
  jobStore: new Map<string, { state: string; delay: number; promoted: boolean; removed: boolean }>(),
}));

// Mock BullMQ so we never touch real Redis. The Queue mock models add / getJob /
// promote / remove against `jobStore` so we can assert scheduling behaviour.
vi.mock('bullmq', async (importOriginal) => {
  const original = await importOriginal<typeof import('bullmq')>();
  return {
    ...original,
    Queue: class {
      name: string;
      constructor(name: string) {
        this.name = name;
      }
      async add(_name: string, _data: unknown, opts: { jobId: string; delay?: number }) {
        const delay = opts.delay ?? 0;
        jobStore.set(opts.jobId, { state: delay > 0 ? 'delayed' : 'waiting', delay, promoted: false, removed: false });
        return { id: opts.jobId };
      }
      async getJob(id: string) {
        const rec = jobStore.get(id);
        if (!rec || rec.removed) return undefined;
        return {
          id,
          async getState() {
            return rec.state;
          },
          async promote() {
            rec.promoted = true;
            rec.state = 'waiting';
          },
          async remove() {
            rec.removed = true;
            jobStore.delete(id);
          },
        };
      }
      async close() {}
    },
    Worker: class {
      constructor() {}
      async close() {}
    },
  };
});

import { enqueue, enqueueImmediate } from '@/lib/bullmq/enqueue';
import { JobType } from '@/lib/bullmq/types';
import { prisma } from '@/lib/prisma';
import { tenantStorage } from '@/lib/tenant-context';

describe('enqueueImmediate (Send Now / run-now fast-forward)', () => {
  const tenantId = 'default-tenant';

  beforeEach(async () => {
    jobStore.clear();
    await tenantStorage.run({ tenantId, bypassRls: true }, async () => {
      await prisma.jobRun.deleteMany();
    });
  });

  it('promotes an already-scheduled delayed job instead of adding a colliding duplicate', async () => {
    const payload = { taskId: 'task-promote-1' };

    // Simulate createTaskForStep: a delayed execute-task job for this task.
    const delayedId = await enqueue(JobType.SEQUENCE_EXECUTE_TASK, payload, { delay: 86_400_000, tenantId });
    expect(jobStore.get(delayedId)?.state).toBe('delayed');

    // Send Now on the same task.
    const nowId = await enqueueImmediate(JobType.SEQUENCE_EXECUTE_TASK, payload, { tenantId });

    // Same job (JobRun.id == jobId invariant preserved), promoted rather than duplicated.
    expect(nowId).toBe(delayedId);
    expect(jobStore.size).toBe(1);
    expect(jobStore.get(nowId)?.promoted).toBe(true);
    expect(jobStore.get(nowId)?.state).toBe('waiting');
  });

  it('adds a fresh immediate job when nothing is scheduled (non-autoComplete step)', async () => {
    const payload = { taskId: 'task-fresh-1' };

    const jobId = await enqueueImmediate(JobType.SEQUENCE_EXECUTE_TASK, payload, { tenantId });

    const rec = jobStore.get(jobId);
    expect(rec).toBeDefined();
    expect(rec?.state).toBe('waiting');
    expect(rec?.delay).toBe(0);
    expect(rec?.promoted).toBe(false);

    // The durable JobRun mirror is queued and keyed to the same id.
    const jobRun = await tenantStorage.run({ tenantId, bypassRls: true }, async () => {
      return prisma.jobRun.findUnique({ where: { id: jobId } });
    });
    expect(jobRun?.status).toBe('queued');
    expect(jobRun?.jobName).toBe(JobType.SEQUENCE_EXECUTE_TASK);
  });

  it('removes a terminal job and re-adds a fresh immediate one', async () => {
    const payload = { taskId: 'task-terminal-1' };

    const firstId = await enqueue(JobType.SEQUENCE_EXECUTE_TASK, payload, { delay: 0, tenantId });
    // Simulate the job having already run and completed.
    jobStore.get(firstId)!.state = 'completed';

    const nowId = await enqueueImmediate(JobType.SEQUENCE_EXECUTE_TASK, payload, { tenantId });

    expect(nowId).toBe(firstId);
    const rec = jobStore.get(nowId);
    expect(rec?.removed).toBe(false);
    expect(rec?.state).toBe('waiting');
    expect(rec?.promoted).toBe(false);
  });
});
