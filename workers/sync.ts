import { prisma } from '@/lib/prisma';
import { createAppWorker } from '@/lib/bullmq';
import { JobType } from '@/lib/bullmq/types';
import type { EmailSyncPayload, EmailApplyReplyPayload, EmailApplyBouncePayload } from '@/lib/bullmq/types';
import { EmailService } from '@/lib/email/EmailService';
import { isBounceMessage, isAutoReply, extractBouncedRecipient } from '@/lib/email/bounceDetection';
import { pauseSequence } from '@/lib/sequences/engine';

const SOFT_BOUNCE_RE = /temporarily|try again later|mailbox full|over quota|too large|try again/i;

function classifyBounceType(subject: string): 'hard' | 'soft' {
  return SOFT_BOUNCE_RE.test(subject) ? 'soft' : 'hard';
}

async function handleEmailSync(payload: EmailSyncPayload) {
  const { accountId } = payload;

  const account = await prisma.emailAccount.findUnique({
    where: { id: accountId },
  });
  if (!account) return { skipped: true, reason: 'account_not_found' };
  if (!account.isActive) return { skipped: true, reason: 'account_inactive' };

  const now = new Date();
  const since = account.lastSyncAt ?? new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const service = await EmailService.fromAccount(account);
  const messages = await service.fetchMessagesSince(since);
  if (messages === null) {
    await prisma.emailAccount.update({
      where: { id: accountId },
      data: { lastSyncAt: now },
    });
    return { skipped: true, reason: 'adapter_does_not_support_sync' };
  }

  let replies = 0;
  let bounces = 0;

  const bounceMessages = messages.filter(m => isBounceMessage(m));
  const replyMessages = messages.filter(m => !isBounceMessage(m) && !isAutoReply(m) && m.fromEmail);

  const allEmails = [
    ...bounceMessages.map(m => extractBouncedRecipient(m)).filter(Boolean),
    ...replyMessages.map(m => m.fromEmail).filter(Boolean),
  ] as string[];

  if (allEmails.length > 0) {
    const existingLeads = await prisma.lead.findMany({
      where: {
        email: { in: allEmails, mode: 'insensitive' },
        assignedToId: account.userId,
      },
      select: { id: true, email: true, sequenceId: true, sequenceStatus: true, emailInvalid: true },
    });

    const leadByEmail = new Map<string, typeof existingLeads[0]>();
    for (const l of existingLeads) {
      leadByEmail.set(l.email.toLowerCase(), l);
    }

    for (const msg of bounceMessages) {
      const bounced = extractBouncedRecipient(msg);
      if (!bounced) continue;
      const lead = leadByEmail.get(bounced.toLowerCase());
      if (!lead || lead.emailInvalid) continue;

      const bounceType = classifyBounceType(msg.subject);
      await handleApplyBounce({
        providerMessageId: msg.providerMessageId,
        leadId: lead.id,
        accountId,
        bounceType,
      });
      bounces++;
    }

    for (const msg of replyMessages) {
      const lead = leadByEmail.get(msg.fromEmail!.toLowerCase());
      if (!lead || !lead.sequenceId || lead.sequenceStatus !== 'active') continue;

      await handleApplyReply({
        providerMessageId: msg.providerMessageId,
        leadId: lead.id,
        accountId,
      });
      replies++;
    }
  }

  await prisma.emailAccount.update({
    where: { id: accountId },
    data: { lastSyncAt: now },
  });

  return { success: true, accountId, messagesProcessed: messages.length, replies, bounces };
}

export async function handleApplyReply(payload: EmailApplyReplyPayload) {
  const { providerMessageId, leadId, accountId } = payload;

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, stage: true, sequenceStatus: true, assignedToId: true, firstName: true, lastName: true, company: true },
  });
  if (!lead) return { skipped: true, reason: 'lead_not_found' };
  if (lead.stage === 'replied') return { skipped: true, reason: 'already_replied' };
  if (lead.sequenceStatus === 'paused' || lead.sequenceStatus === null) {
    return { skipped: true, reason: 'sequence_not_active' };
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: { stage: 'replied' },
  });

  await pauseSequence(leadId, 'replied', lead.assignedToId ?? accountId);

  await prisma.activity.create({
    data: {
      userId: lead.assignedToId ?? accountId,
      leadId,
      type: 'stage_changed',
      channel: 'email',
      description: `Reply received from ${lead.firstName} ${lead.lastName} — moved to Replied`,
      metadata: { from: lead.stage, to: 'replied', providerMessageId, auto: true },
    },
  });

  await prisma.task.create({
    data: {
      leadId,
      userId: lead.assignedToId ?? accountId,
      type: 'manual',
      title: `Handle reply from ${lead.firstName} ${lead.lastName}`,
      description: `Replied to your outreach email. Respond while it's warm.`,
      dueDate: new Date(),
      priority: 'high',
    },
  });

  await prisma.notification.create({
    data: {
      userId: lead.assignedToId ?? accountId,
      type: 'lead_replied',
      title: 'Lead Replied!',
      text: `${lead.firstName} ${lead.lastName} (${lead.company}) replied to your email. Sequence paused — handle the reply.`,
      linkTo: `/leads/${leadId}`,
    },
  });

  return { success: true, leadId, providerMessageId };
}

export async function handleApplyBounce(payload: EmailApplyBouncePayload) {
  const { providerMessageId, leadId, accountId, bounceType } = payload;

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, email: true, firstName: true, lastName: true, company: true, sequenceId: true, assignedToId: true, tags: true, emailInvalid: true, tenantId: true },
  });
  if (!lead) return { skipped: true, reason: 'lead_not_found' };

  const isHard = bounceType === 'hard';

  // Hard bounces make the email permanently invalid; soft bounces are transient
  if (isHard) {
    if (lead.emailInvalid) return { skipped: true, reason: 'already_invalid' };

    const tags = lead.tags as string[] | undefined;
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        emailInvalid: true,
        tags: tags?.includes('invalid-email') ? undefined : { push: 'invalid-email' },
      },
    });

    const existingSuppression = await prisma.suppressionEntry.findFirst({
      where: { tenantId: lead.tenantId, email: lead.email, reason: 'hard_bounce' },
    });
    if (!existingSuppression) {
      await prisma.suppressionEntry.create({
        data: {
          email: lead.email,
          reason: 'hard_bounce',
          tenantId: lead.tenantId,
        },
      });
    }
  }

  if (lead.sequenceId) {
    await pauseSequence(leadId, 'bounced', lead.assignedToId ?? accountId);
  }

  await prisma.notification.create({
    data: {
      userId: lead.assignedToId ?? accountId,
      type: 'email_bounced',
      title: isHard ? 'Email Bounced (Hard)' : 'Email Bounced (Soft)',
      text: `Email to ${lead.firstName} ${lead.lastName} (${lead.email}) ${isHard ? 'hard-bounced' : 'soft-bounced'}. The address was ${isHard ? 'flagged invalid' : 'temporarily rejected'}${lead.sequenceId ? ' and the sequence was paused' : ''}.`,
      linkTo: `/leads/${leadId}`,
    },
  });

  return { success: true, leadId, bounceType, providerMessageId };
}

export { handleEmailSync, createSyncWorker };

function createSyncWorker() {
  return createAppWorker(
    'sync',
    async (job) => {
      if (job.name === JobType.EMAIL_SYNC) {
        return handleEmailSync(job.data as EmailSyncPayload);
      }
      if (job.name === JobType.EMAIL_APPLY_REPLY) {
        return handleApplyReply(job.data as EmailApplyReplyPayload);
      }
      if (job.name === JobType.EMAIL_APPLY_BOUNCE) {
        return handleApplyBounce(job.data as EmailApplyBouncePayload);
      }
    },
    { concurrency: 3 }
  );
}
