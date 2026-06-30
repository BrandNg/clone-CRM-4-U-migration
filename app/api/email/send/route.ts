import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, canAccessLead } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { renderTemplate } from '@/lib/templates/render';
import { parseBody } from '@/lib/validation/core';
import { sendEmailSchema } from '@/lib/validation/schemas';
import { createOutboundMessage, enqueueEmailSendWorkflow } from '@/lib/workflows/email';

export async function POST(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const parsed = await parseBody(req, sendEmailSchema, 'Invalid email send');
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  const tenantId = user.tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: 'No tenant context' }, { status: 401 });
  }

  let leadCampaignId: string | null = null;

  if (body.leadId) {
    const lead = await prisma.lead.findUnique({
      where: { id: body.leadId },
      select: { assignedToId: true, campaignId: true, tenantId: true },
    });
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    if (!(await canAccessLead(user, lead))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    leadCampaignId = lead.campaignId;
  }

  // Suppression gate — check recipient email/domain against suppression entries
  const recipientDomain = body.to.split('@')[1];
  const suppressed = await prisma.suppressionEntry.findFirst({
    where: {
      tenantId,
      AND: [
        { OR: [{ email: body.to }, { domain: recipientDomain }] },
        { OR: [{ campaignId: leadCampaignId }, { campaignId: null }] },
      ],
    },
  });
  if (suppressed) {
    return NextResponse.json({ error: 'Recipient is suppressed' }, { status: 403 });
  }

  const account = await prisma.emailAccount.findFirst({
    where: { id: body.accountId, userId: user.id },
  });
  if (!account) {
    return NextResponse.json({ error: 'Email account not found' }, { status: 404 });
  }

  let subject: string = body.subject ?? '';
  let text: string = body.text ?? body.body ?? '';

  // When sending from a template, render merge fields server-side with real lead data
  if (body.templateId && body.leadId) {
    const [template, lead] = await Promise.all([
      prisma.template.findUnique({ where: { id: body.templateId } }),
      prisma.lead.findUnique({ where: { id: body.leadId } }),
    ]);
    if (!template || !lead) {
      return NextResponse.json({ error: 'Template or lead not found' }, { status: 404 });
    }
    subject = renderTemplate(body.subject ?? template.subject ?? '', lead, user);
    text = renderTemplate(body.body ?? template.body, lead, user);
  } else if (body.leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: body.leadId } });
    if (lead) {
      subject = renderTemplate(subject, lead, user);
      text = renderTemplate(text, lead, user);
    }
  }

  if (!subject.trim()) {
    return NextResponse.json({ error: 'Subject cannot be empty' }, { status: 400 });
  }
  if (!text.trim()) {
    return NextResponse.json({ error: 'Body cannot be empty' }, { status: 400 });
  }

  try {
    const outboundMessage = await createOutboundMessage({
      leadId: body.leadId ?? 'unknown',
      accountId: body.accountId,
      templateId: body.templateId,
      to: body.to,
      subject,
      body: text,
      tenantId,
    });

    await enqueueEmailSendWorkflow(
      {
        outboundMessageId: outboundMessage.id,
        accountId: body.accountId,
        to: body.to,
        subject,
        body: text,
        leadId: body.leadId,
        templateId: body.templateId,
      },
      tenantId
    );

    return NextResponse.json({ success: true, outboundMessageId: outboundMessage.id });
  } catch (err) {
    console.error('[email/send] enqueue failed:', err);
    return NextResponse.json({ error: 'Failed to queue email' }, { status: 500 });
  }
}
