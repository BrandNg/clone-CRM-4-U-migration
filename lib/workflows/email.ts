import { prisma } from '@/lib/prisma';
import { enqueue } from '@/lib/bullmq/enqueue';
import { JobType, type EmailSendPayload, type EmailApplyReplyPayload, type EmailApplyBouncePayload } from '@/lib/bullmq';
import { generateIdempotencyKey } from '@/lib/bullmq/jobOptions';

export async function createOutboundMessage(params: {
  leadId: string;
  accountId: string;
  templateId?: string;
  to: string;
  subject: string;
  body: string;
  tenantId: string;
}) {
  const idempotencyKey = generateIdempotencyKey(params.leadId, params.accountId, params.subject);
  const existing = await prisma.outboundMessage.findUnique({
    where: { idempotencyKey },
  });
  if (existing) return existing;
  return prisma.outboundMessage.create({
    data: {
      leadId: params.leadId,
      accountId: params.accountId,
      templateId: params.templateId,
      to: params.to,
      subject: params.subject,
      body: params.body,
      idempotencyKey,
      status: 'pending',
      tenantId: params.tenantId,
    },
  });
}

export async function enqueueEmailSendWorkflow(
  payload: EmailSendPayload,
  tenantId: string
): Promise<string> {
  return enqueue(JobType.EMAIL_SEND, payload, { tenantId });
}

export async function enqueueEmailSyncWorkflow(
  accountId: string,
  tenantId: string
): Promise<string> {
  return enqueue(JobType.EMAIL_SYNC, { accountId }, { tenantId });
}

export async function enqueueEmailApplyReplyWorkflow(
  payload: EmailApplyReplyPayload,
  tenantId: string
): Promise<string> {
  return enqueue(JobType.EMAIL_APPLY_REPLY, payload, { tenantId });
}

export async function enqueueEmailApplyBounceWorkflow(
  payload: EmailApplyBouncePayload,
  tenantId: string
): Promise<string> {
  return enqueue(JobType.EMAIL_APPLY_BOUNCE, payload, { tenantId });
}
