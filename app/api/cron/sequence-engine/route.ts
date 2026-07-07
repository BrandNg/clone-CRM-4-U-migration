import { NextRequest, NextResponse } from 'next/server';
import { prisma, tenantStorage } from '@/lib/prisma';
import { EmailService } from '@/lib/email/EmailService';
import { scheduleSmartSends, distributeSends } from '@/lib/sequences/smartSend';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

const LOCK_STALE_MS = 10 * 60 * 1000;

async function createDailyNotifications(now: Date): Promise<number> {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setHours(23, 59, 59, 999);

  let created = 0;

  // task_overdue — one notification per SDR per day for all overdue pending tasks
  const overdueTasks = await prisma.task.findMany({
    where: { status: 'pending', dueDate: { lt: startOfDay } },
    select: { userId: true },
  });

  if (overdueTasks.length > 0) {
    const countByUser = new Map<string, number>();
    for (const t of overdueTasks) {
      countByUser.set(t.userId, (countByUser.get(t.userId) ?? 0) + 1);
    }

    const existing = await prisma.notification.findMany({
      where: { type: 'task_overdue', createdAt: { gte: startOfDay } },
      select: { userId: true },
    });
    const alreadyNotified = new Set(existing.map((n) => n.userId));

    for (const [userId, count] of countByUser.entries()) {
      if (alreadyNotified.has(userId)) continue;
      await prisma.notification.create({
        data: {
          userId,
          type: 'task_overdue',
          title: 'Overdue Tasks',
          text: `You have ${count} overdue task${count === 1 ? '' : 's'} that need${count === 1 ? 's' : ''} attention.`,
          linkTo: '/',
        },
      });
      created++;
    }
  }

  // sequence_step_due — one notification per SDR per day when they have sequence tasks due today
  const seqTasksDueToday = await prisma.task.findMany({
    where: {
      status: 'pending',
      sequenceId: { not: null },
      dueDate: { gte: startOfDay, lte: endOfDay },
    },
    select: { userId: true },
  });

  if (seqTasksDueToday.length > 0) {
    const seqCountByUser = new Map<string, number>();
    for (const t of seqTasksDueToday) {
      seqCountByUser.set(t.userId, (seqCountByUser.get(t.userId) ?? 0) + 1);
    }

    const existingSeq = await prisma.notification.findMany({
      where: { type: 'sequence_step_due', createdAt: { gte: startOfDay } },
      select: { userId: true },
    });
    const alreadyNotifiedSeq = new Set(existingSeq.map((n) => n.userId));

    for (const [userId, count] of seqCountByUser.entries()) {
      if (alreadyNotifiedSeq.has(userId)) continue;
      await prisma.notification.create({
        data: {
          userId,
          type: 'sequence_step_due',
          title: 'Sequence Steps Due Today',
          text: `You have ${count} sequence step${count === 1 ? '' : 's'} due today.`,
          linkTo: '/',
        },
      });
      created++;
    }
  }

  return created;
}

const MANAGER_ROLES = ['director', 'floor_manager', 'team_lead'];

export async function GET(req: NextRequest) {
  const isCronSecret =
    process.env.CRON_SECRET &&
    req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  const session = isCronSecret ? null : await auth();
  const isManager = session?.user && MANAGER_ROLES.includes((session.user as any)?.role ?? '');
  if (!isCronSecret && !isManager) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (process.env.SEQUENCE_AUTOSEND_ENABLED === 'false') {
    return NextResponse.json({ disabled: true, sent: 0 });
  }

  return await tenantStorage.run({ tenantId: 'system', bypassRls: true }, async () => {
    const activeAccounts = await prisma.emailAccount.findMany({
      where: { isActive: true },
      select: { id: true, userId: true },
    });

    const userIds = [...new Set(activeAccounts.map(a => a.userId))];
    const userTenants = userIds.length > 0 ? await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, tenantId: true },
    }) : [];
    const tenantMap = new Map(userTenants.map(u => [u.id, u.tenantId]));

    for (const acc of activeAccounts) {
      const tenantId = tenantMap.get(acc.userId);
      if (tenantId) {
        await tenantStorage.run({ tenantId }, async () => {
          await distributeSends(acc.id);
        });
      }
    }

    const result = await scheduleSmartSends();

    const now = new Date();
    const lockCutoff = new Date(now.getTime() - LOCK_STALE_MS);

    const manualTasks = await prisma.task.findMany({
      where: {
        status: 'pending',
        type: 'email',
        sequenceId: null,
        dueDate: { lte: now },
        OR: [{ lockedAt: null }, { lockedAt: { lt: lockCutoff } }],
      },
      orderBy: { dueDate: 'asc' },
      take: 10,
      include: {
        lead: {
          include: { assignedTo: { select: { id: true, firstName: true, lastName: true, role: true } } },
        },
      },
    });

    for (const task of manualTasks) {
      try {
        const account = await prisma.emailAccount.findFirst({
          where: { userId: task.lead.assignedToId, isActive: true },
        });
        if (!account) continue;

        const tenantId = tenantMap.get(task.lead.assignedToId);
        if (!tenantId) continue;

        const claimed = await prisma.task.updateMany({
          where: { id: task.id, status: 'pending', lockedAt: task.lockedAt },
          data: { lockedAt: now },
        });
        if (claimed.count !== 1) continue;

        try {
          await tenantStorage.run({ tenantId }, async () => {
            const service = await EmailService.fromAccount(account);
            await service.send({
              from: account.email,
              to: task.lead.email,
              subject: task.title,
              text: task.description ?? '',
            });
          });
        } catch (sendErr) {
          console.error(`[sequence-engine] Failed to send email for task ${task.id}:`, sendErr);
          await prisma.task.update({ where: { id: task.id }, data: { lockedAt: null } });
          result.errors.push(task.id);
          continue;
        }

        try {
          await tenantStorage.run({ tenantId }, async () => {
            await prisma.task.update({
              where: { id: task.id },
              data: { status: 'completed', completedAt: new Date() },
            });
          });
          result.sent++;
        } catch (dbErr) {
          console.error(`[sequence-engine] Failed to mark task ${task.id} as completed after sending:`, dbErr);
          result.sent++;
        }
      } catch (err) {
        console.error(`[sequence-engine] Error processing manual task ${task.id}:`, err);
        result.errors.push(task.id);
      }
    }

    let notified = 0;
    try {
      notified = await tenantStorage.run({ tenantId: 'system', bypassRls: true }, async () => {
        return await createDailyNotifications(now);
      });
    } catch (err) {
      console.error('[sequence-engine] daily notifications failed:', err);
    }

    return NextResponse.json({
      processed: (result.sent + result.skipped + result.errors.length + manualTasks.length),
      sent: result.sent,
      skipped: result.skipped,
      errors: result.errors.length,
      notified,
    });
  });
}
