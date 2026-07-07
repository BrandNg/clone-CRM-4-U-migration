import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';

// Called by Topbar on mount to auto-create overdue-task notifications.
// Fires at most once per calendar day per user (idempotent).
export async function POST() {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(now.getTime() - 86400000);

  // Run all read queries in parallel (was 4 sequential round-trips before).
  const [overdueCount, existingOverdue, dueReminders, recentReminderNotifs] = await Promise.all([
    prisma.task.count({
      where: { userId: user.id, status: 'pending', dueDate: { lt: todayStart } },
    }),
    prisma.notification.findFirst({
      where: { userId: user.id, type: 'overdue_tasks', createdAt: { gte: todayStart } },
    }),
    prisma.reminder.findMany({
      where: { userId: user.id, isDismissed: false, dueAt: { lte: now } },
      select: { id: true, text: true, leadId: true },
      take: 10,
    }),
    prisma.notification.findMany({
      where: { userId: user.id, type: 'reminder_due', createdAt: { gte: yesterday } },
      select: { text: true, linkTo: true },
    }),
  ]);

  // Write phase — at most 2 writes (overdue upsert + reminder createMany).
  const writes: Promise<unknown>[] = [];

  if (overdueCount > 0) {
    const overdueText = `You have ${overdueCount} overdue task${overdueCount > 1 ? 's' : ''} — clear them before they pile up.`;
    if (!existingOverdue) {
      writes.push(
        prisma.notification.create({
          data: { userId: user.id, type: 'overdue_tasks', title: 'Overdue Tasks', text: overdueText, linkTo: '/?tab=overdue' },
        })
      );
    } else if (!existingOverdue.text.startsWith(`You have ${overdueCount}`)) {
      writes.push(
        prisma.notification.update({
          where: { id: existingOverdue.id },
          data: { text: overdueText, isRead: false },
        })
      );
    }
  }

  const newReminderNotifs = dueReminders
    .filter((rem) => {
      const linkTo = rem.leadId ? `/leads/${rem.leadId}` : null;
      const prefix = rem.text.slice(0, 30);
      return !recentReminderNotifs.some((n) => n.linkTo === linkTo && n.text.includes(prefix));
    })
    .map((rem) => ({
      userId: user.id,
      type: 'reminder_due' as const,
      title: 'Reminder Due',
      text: `Reminder: ${rem.text}`,
      linkTo: rem.leadId ? `/leads/${rem.leadId}` : null,
    }));

  if (newReminderNotifs.length > 0) {
    writes.push(prisma.notification.createMany({ data: newReminderNotifs }));
  }

  if (writes.length > 0) await Promise.all(writes);

  return NextResponse.json({ checked: true, overdueCount });
}
