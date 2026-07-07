import { prisma } from '@/lib/prisma';
import { renderTemplate } from '@/lib/templates/render';
import { advanceSequence } from './engine';
import { createOutboundMessage, enqueueEmailSendWorkflow } from '@/lib/workflows/email';

const BUSINESS_HOUR_START = 9;
const BUSINESS_HOUR_END = 17;
const MAX_SENDS_PER_DAY = 80;
const OPTIMAL_WINDOWS: Record<string, { start: number; end: number }> = {
  'America/New_York': { start: 9, end: 11 },
  'America/Chicago': { start: 9, end: 11 },
  'America/Denver': { start: 9, end: 10 },
  'America/Los_Angeles': { start: 9, end: 11 },
  'Europe/London': { start: 9, end: 12 },
  'Europe/Berlin': { start: 9, end: 11 },
  'Asia/Ho_Chi_Minh': { start: 9, end: 11 },
  'Asia/Singapore': { start: 9, end: 11 },
  'Australia/Sydney': { start: 9, end: 11 },
};

export function isWithinBusinessHours(date: Date, timezone: string = 'UTC'): boolean {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    const hour = parseInt(formatter.format(date), 10);
    return hour >= BUSINESS_HOUR_START && hour < BUSINESS_HOUR_END;
  } catch (err) {
    console.error(`[isWithinBusinessHours] Invalid timezone "${timezone}", falling back to UTC:`, err);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      hour: 'numeric',
      hour12: false,
    });
    const hour = parseInt(formatter.format(date), 10);
    return hour >= BUSINESS_HOUR_START && hour < BUSINESS_HOUR_END;
  }
}

export function getOptimalSendTime(leadTimezone: string | null): { hour: number; minute: number } {
  if (!leadTimezone || !OPTIMAL_WINDOWS[leadTimezone]) return { hour: 10, minute: 0 };
  const window = OPTIMAL_WINDOWS[leadTimezone];
  const hour = window.start + Math.floor(Math.random() * (window.end - window.start));
  return { hour, minute: Math.floor(Math.random() * 60) };
}

export async function distributeSends(accountId: string): Promise<void> {
  const account = await prisma.emailAccount.findUnique({
    where: { id: accountId },
    select: { id: true, dailySendCount: true, dailySendDate: true, hourlySendWindow: true },
  });
  if (!account) return;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const currentHour = now.getHours();
  const windowStart = Math.floor(currentHour / 2) * 2;

  const isNewDay = !account.dailySendDate || account.dailySendDate < today;
  const isNewWindow = account.hourlySendWindow !== windowStart;

  if (isNewDay || isNewWindow) {
    await prisma.emailAccount.update({
      where: { id: accountId },
      data: {
        ...(isNewDay && { dailySendCount: 0, dailySendDate: today }),
        hourlySendWindow: windowStart,
      },
    });
  }
}

export async function canSendNow(accountId: string): Promise<boolean> {
  const account = await prisma.emailAccount.findUnique({
    where: { id: accountId },
    select: { dailySendCount: true, dailySendDate: true },
  });
  if (!account) return false;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (!account.dailySendDate || account.dailySendDate < today) {
    await prisma.emailAccount.update({
      where: { id: accountId },
      data: { dailySendCount: 0, dailySendDate: today },
    });
    return true;
  }

  return account.dailySendCount < MAX_SENDS_PER_DAY;
}

export async function incrementSendCount(accountId: string): Promise<void> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  await prisma.emailAccount.update({
    where: { id: accountId },
    data: {
      dailySendCount: { increment: 1 },
      dailySendDate: today,
    },
  });
}

export async function scheduleSmartSends(): Promise<{ sent: number; skipped: number; errors: string[] }> {
  const now = new Date();
  const lockCutoff = new Date(now.getTime() - 10 * 60 * 1000);

  const dueTasks = await prisma.task.findMany({
    where: {
      status: 'pending',
      type: 'email',
      sequenceId: { not: null },
      dueDate: { lte: now },
      OR: [{ lockedAt: null }, { lockedAt: { lt: lockCutoff } }],
    },
    orderBy: { dueDate: 'asc' },
    take: 50,
    include: {
      lead: {
        include: { assignedTo: { select: { id: true, firstName: true, lastName: true, role: true } } },
      },
    },
  });

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  const sequenceStepIds = [...new Set(dueTasks.filter(t => t.sequenceId && t.sequenceStep != null).map(t => `${t.sequenceId}:${t.sequenceStep}`))];
  const stepMap = new Map<string, { autoComplete: boolean; channel: string; order: number; template: any }>();
  if (sequenceStepIds.length > 0) {
    const steps = await prisma.sequenceStep.findMany({
      where: {
        OR: sequenceStepIds.map(key => {
          const [seqId, order] = key.split(':');
          return { sequenceId: seqId, order: parseInt(order, 10) };
        }),
      },
      include: { template: { include: { abVariants: true } } },
    });
    for (const s of steps) {
      stepMap.set(`${s.sequenceId}:${s.order}`, s);
    }
  }

  const assigneeIds = [...new Set(dueTasks.map(t => t.lead.assignedToId).filter(Boolean))];
  const accountMap = new Map<string, { id: string }>();
  if (assigneeIds.length > 0) {
    const accounts = await prisma.emailAccount.findMany({
      where: { userId: { in: assigneeIds }, isActive: true },
      select: { id: true, userId: true },
    });
    for (const a of accounts) {
      accountMap.set(a.userId, a);
    }
  }

  for (const task of dueTasks) {
    try {
      const { lead } = task;

      const step = stepMap.get(`${task.sequenceId}:${task.sequenceStep}`);

      const template = step?.template;
      const eligible =
        step?.autoComplete &&
        step.channel === 'email' &&
        template &&
        lead.sequenceId === task.sequenceId &&
        lead.sequenceStatus === 'active' &&
        !lead.emailInvalid &&
        lead.email;
      if (!eligible || !template) { skipped++; continue; }

      if (lead.timezone && !isWithinBusinessHours(now, lead.timezone)) {
        skipped++;
        continue;
      }

      const account = accountMap.get(lead.assignedToId);
      if (!account) { skipped++; continue; }

      if (!(await canSendNow(account.id))) { skipped++; continue; }

      const claimed = await prisma.task.updateMany({
        where: { id: task.id, status: 'pending', lockedAt: task.lockedAt },
        data: { lockedAt: now },
      });
      if (claimed.count !== 1) { skipped++; continue; }

      let subject: string;
      let body: string;

      let selectedVariantId: string | null = null;
      const variantA = template.abVariants.find((v: any) => v.version === 'A');
      const variantB = template.abVariants.find((v: any) => v.version === 'B');
      if (variantA && variantB) {
        const useB = Math.random() < 0.5;
        const selected = useB ? variantB : variantA;
        subject = renderTemplate(selected.subject ?? template.subject ?? '', lead, lead.assignedTo);
        body = renderTemplate(selected.body ?? template.body, lead, lead.assignedTo);
        selectedVariantId = selected.id;
      } else {
        subject = renderTemplate(template.subject ?? '', lead, lead.assignedTo);
        body = renderTemplate(template.body, lead, lead.assignedTo);
      }

      try {
        const outbound = await createOutboundMessage({
          leadId: lead.id,
          accountId: account.id,
          templateId: template.id,
          to: lead.email,
          subject,
          body,
          tenantId: lead.tenantId,
        });
        await enqueueEmailSendWorkflow(
          {
            outboundMessageId: outbound.id,
            accountId: account.id,
            to: lead.email,
            subject,
            body,
            leadId: lead.id,
            templateId: template.id,
          },
          lead.tenantId
        );
      } catch (sendErr) {
        await prisma.task.update({ where: { id: task.id }, data: { lockedAt: null } });
        console.error(`[smart-send] enqueue failed for task ${task.id}:`, sendErr);
        errors.push(task.id);
        continue;
      }

      try {
        await prisma.task.update({
          where: { id: task.id },
          data: { status: 'completed', completedAt: new Date() },
        });

        if (selectedVariantId) {
          await prisma.abTestVariant.update({
            where: { id: selectedVariantId },
            data: { sentCount: { increment: 1 } },
          });
        }

        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            lastContactedAt: new Date(),
            emailSentCount: { increment: 1 },
          },
        });

        await prisma.activity.create({
          data: {
            userId: lead.assignedToId,
            leadId: lead.id,
            type: 'email_sent',
            channel: 'email',
            description: lead.timezone
              ? `Smart-sent at ${new Date().toLocaleTimeString('en-US', { timeZone: lead.timezone })} ${lead.timezone}`
              : 'Auto-sent sequence email',
            metadata: {
              auto: true,
              accountId: account.id,
              subject,
              taskId: task.id,
              timezone: lead.timezone,
              sequenceId: task.sequenceId,
              sequenceStep: step.order,
            },
          },
        });

        await advanceSequence(task, lead.assignedToId);
        sent++;
      } catch (dbErr) {
        console.error(`[smart-send] DB update failed for task ${task.id} after successful email send:`, dbErr);
        sent++;
      }
    } catch (err) {
      console.error(`[smart-send] task ${task.id} failed:`, err);
      errors.push(task.id);
    }
  }

  return { sent, skipped, errors };
}

export async function isWithinSendWindow(accountId: string): Promise<boolean> {
  const account = await prisma.emailAccount.findUnique({
    where: { id: accountId },
    select: { hourlySendWindow: true, dailySendCount: true, dailySendDate: true },
  });
  if (!account) return false;

  const now = new Date();
  const currentHour = now.getHours();
  const windowStart = Math.floor(currentHour / 2) * 2;
  return account.hourlySendWindow === windowStart;
}
