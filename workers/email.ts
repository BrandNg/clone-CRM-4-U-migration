import { prisma } from '@/lib/prisma';
import { createAppWorker } from '@/lib/bullmq';
import { JobType } from '@/lib/bullmq/types';
import type { EmailSendPayload } from '@/lib/bullmq/types';
import { EmailService } from '@/lib/email/EmailService';
import { renderTemplate } from '@/lib/templates/render';

function isHtml(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text);
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
async function atomicReserveQuota(accountId: string): Promise<boolean> {
  const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const result = await prisma.$executeRaw`
    UPDATE "EmailAccount"
    SET
      "dailySendCount" = CASE
        WHEN "dailySendDate" IS NULL OR "dailySendDate" < ${today} THEN 1
        ELSE "dailySendCount" + 1
      END,
      "dailySendDate" = ${today}
    WHERE id = ${accountId}
      AND (
        "dailySendDate" IS NULL
        OR "dailySendDate" < ${today}
        OR "dailySendCount" < "dailyCap"
      )
  `;
  return result > 0;
}

async function handleEmailSend(payload: EmailSendPayload) {
  const { outboundMessageId, accountId, to, subject, body, leadId } = payload;

  const existing = await prisma.outboundMessage.findUnique({
    where: { id: outboundMessageId },
    include: { lead: { select: { campaignId: true, assignedToId: true } } },
  });
  if (!existing) throw new Error(`OutboundMessage not found: ${outboundMessageId}`);
  if (existing.status === 'sent' && existing.providerMessageId) {
    return { skipped: true, reason: 'already_sent', providerMessageId: existing.providerMessageId };
  }
  if (existing.status === 'sending' && existing.providerMessageId) {
    return { skipped: true, reason: 'already_sent_provider_reconcile', providerMessageId: existing.providerMessageId };
  }

  // Check suppression
  const recipientDomain = to.split('@')[1];
  const suppressed = await prisma.suppressionEntry.findFirst({
    where: {
      tenantId: existing.tenantId,
      AND: [
        { OR: [{ email: to }, { domain: recipientDomain }] },
        ...(leadId && existing.lead?.campaignId
          ? [{ OR: [{ campaignId: existing.lead.campaignId }, { campaignId: null }] }]
          : []),
      ],
    },
  });
  if (suppressed) {
    await prisma.outboundMessage.update({
      where: { id: outboundMessageId },
      data: { status: 'failed', errorMessage: `Recipient suppressed: ${suppressed.reason}` },
    });
    return { skipped: true, reason: 'suppressed' };
  }

  // Atomically reserve quota
  const quotaOk = await atomicReserveQuota(accountId);
  if (!quotaOk) {
    await prisma.outboundMessage.update({
      where: { id: outboundMessageId },
      data: { status: 'failed', errorMessage: 'Daily send limit reached' },
    });
    return { skipped: true, reason: 'quota_exhausted' };
  }

  // Mark as sending
  await prisma.outboundMessage.update({
    where: { id: outboundMessageId },
    data: { status: 'sending' },
  });

  // Render template variables if lead is available
  let finalSubject = subject;
  let finalBody = body;
  if (leadId) {
    const leadForRender = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { assignedTo: { select: { id: true, firstName: true, lastName: true, role: true } } },
    });
    if (leadForRender) {
      finalSubject = renderTemplate(subject, leadForRender as any, leadForRender.assignedTo as any);
      finalBody = renderTemplate(body, leadForRender as any, leadForRender.assignedTo as any);
    }
  }

  // Send
  let providerMessageId: string | undefined;
  try {
    const account = await prisma.emailAccount.findUnique({
      where: { id: accountId },
    });
    if (!account) throw new Error(`Email account not found: ${accountId}`);

    // Fetch attachments if templateId is present
    const attachments = existing.templateId
      ? await prisma.attachment.findMany({ where: { templateId: existing.templateId } })
      : [];

    const mappedAttachments = attachments.map((att) => ({
      filename: att.name,
      content: Buffer.from(att.content, 'base64'),
      contentType: att.contentType,
    }));

    // Append signature if available
    let bodyWithSig = finalBody;
    if (account.signature) {
      if (isHtml(finalBody)) {
        bodyWithSig = `${finalBody}<br><br>--<br>${account.signature}`;
      } else {
        bodyWithSig = `${finalBody}\n\n--\n${stripHtml(account.signature)}`;
      }
    }

    // Prepare text and HTML versions
    let textPayload: string;
    let htmlPayload: string;
    if (isHtml(bodyWithSig)) {
      htmlPayload = bodyWithSig;
      textPayload = stripHtml(bodyWithSig);
    } else {
      textPayload = bodyWithSig;
      htmlPayload = `<div style="font-family: sans-serif; white-space: pre-wrap;">${bodyWithSig}</div>`;
    }

    const emailService = await EmailService.fromAccount(account);
    providerMessageId = await emailService.send({
      from: account.email,
      to,
      subject: finalSubject,
      text: textPayload,
      html: htmlPayload,
      attachments: mappedAttachments,
    });
  } catch (sendErr: unknown) {
    const errorMessage = sendErr instanceof Error ? sendErr.message : String(sendErr);
    await prisma.outboundMessage.update({
      where: { id: outboundMessageId },
      data: { status: 'failed', errorMessage },
    });
    throw sendErr;
  }

  // Update OutboundMessage as sent
  await prisma.outboundMessage.update({
    where: { id: outboundMessageId },
    data: {
      status: 'sent',
      providerMessageId: providerMessageId ?? null,
      sentAt: new Date(),
    },
  });

  // Log activity and update lead
  const resolvedLeadId = leadId ?? existing.leadId;
  const resolvedUserId = existing.lead?.assignedToId ?? 'system';
  await prisma.activity.create({
    data: {
      userId: resolvedUserId,
      leadId: resolvedLeadId,
      type: 'email_sent',
      channel: 'email',
      description: `Email sent to ${to}`,
      metadata: { subject: finalSubject, accountId, outboundMessageId },
    },
  });
  await prisma.lead.update({
    where: { id: resolvedLeadId },
    data: { lastContactedAt: new Date() },
  });

  return { success: true, outboundMessageId, providerMessageId };
}

export function createEmailWorker() {
  return createAppWorker(
    'email',
    async (job) => {
      if (job.name !== JobType.EMAIL_SEND) return;
      return handleEmailSend(job.data as EmailSendPayload);
    },
    { concurrency: 5 }
  );
}

export { handleEmailSend };
