import { prisma } from '@/lib/prisma';
import { createAppWorker } from '@/lib/bullmq';
import { JobType } from '@/lib/bullmq/types';
import type { ReminderDuePayload, DigestDailyPayload } from '@/lib/bullmq/types';

async function handleReminderDue(payload: ReminderDuePayload) {
  const { reminderId } = payload;

  const reminder = await prisma.reminder.findUnique({
    where: { id: reminderId },
  });
  if (!reminder) return { skipped: true, reason: 'not_found' };
  if (reminder.isDismissed) return { skipped: true, reason: 'already_dismissed' };

  const existing = await prisma.notification.findFirst({
    where: { userId: reminder.userId, type: 'reminder_due', text: reminder.text },
  });
  if (existing) return { skipped: true, reason: 'already_notified' };

  await prisma.notification.create({
    data: {
      userId: reminder.userId,
      type: 'reminder_due',
      title: 'Reminder Due',
      text: reminder.text,
      linkTo: reminder.leadId ? `/leads/${reminder.leadId}` : undefined,
      tenantId: reminder.tenantId,
    },
  });

  return { success: true, reminderId };
}

async function handleDigestDaily(payload: DigestDailyPayload) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const userFilter = payload.userIds ? { id: { in: payload.userIds } } : {};

  const users = await prisma.user.findMany({
    where: userFilter,
    select: { id: true, tenantId: true },
  });

  const results: { userId: string; overdueCount: number; remindersToday: number }[] = [];

  for (const user of users) {
    const overdueCount = await prisma.task.count({
      where: { userId: user.id, status: 'pending', dueDate: { lt: now } },
    });

    const remindersToday = await prisma.reminder.count({
      where: { userId: user.id, isDismissed: false, dueAt: { gte: todayStart, lte: now } },
    });

    if (overdueCount > 0 || remindersToday > 0) {
      const parts: string[] = [];
      if (overdueCount > 0) parts.push(`${overdueCount} overdue task${overdueCount !== 1 ? 's' : ''}`);
      if (remindersToday > 0) parts.push(`${remindersToday} reminder${remindersToday !== 1 ? 's' : ''} due`);

      const existingDigest = await prisma.notification.findFirst({
        where: {
          userId: user.id,
          type: 'digest_daily',
          createdAt: { gte: todayStart },
        },
      });

      if (!existingDigest) {
        await prisma.notification.create({
          data: {
            userId: user.id,
            type: 'digest_daily',
            title: `Daily Summary — ${parts.join(', ')}`,
            text: `You have ${parts.join(' and ')}.`,
            linkTo: '/tasks',
            tenantId: user.tenantId,
          },
        });
      }

      results.push({ userId: user.id, overdueCount, remindersToday });
    }
  }

  return { usersProcessed: users.length, results };
}

export function createNotificationWorker() {
  return createAppWorker(
    'notification',
    async (job) => {
      if (job.name === JobType.REMINDER_DUE) {
        return handleReminderDue(job.data as ReminderDuePayload);
      }
      if (job.name === JobType.DIGEST_DAILY) {
        return handleDigestDaily(job.data as DigestDailyPayload);
      }
    },
    { concurrency: 3 }
  );
}

export { handleReminderDue, handleDigestDaily };
