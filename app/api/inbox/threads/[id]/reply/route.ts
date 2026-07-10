import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { enqueueEmailSendWorkflow } from '@/lib/workflows/email';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  // Guard: a missing tenant would let this send from another tenant's lead/account.
  if (!user.tenantId) {
    return NextResponse.json({ error: 'No tenant context' }, { status: 403 });
  }

  const { id: threadKey } = await params;

  try {
    const { body, subject, leadId } = await req.json();

    if (!body) {
      return NextResponse.json({ error: 'Reply body is required' }, { status: 400 });
    }

    if (!leadId) {
      return NextResponse.json({ error: 'Lead ID is required' }, { status: 400 });
    }

    // 1. Fetch Lead details — scoped to the caller's tenant.
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, tenantId: user.tenantId },
      select: { id: true, email: true, assignedToId: true },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Associated lead not found' }, { status: 404 });
    }

    // 2. Fetch the active email account for this lead's owner
    const account = await prisma.emailAccount.findFirst({
      where: { userId: lead.assignedToId, isActive: true },
    });

    if (!account) {
      return NextResponse.json({ error: 'No active email account connected for this user' }, { status: 400 });
    }

    // 3. Create unique outbound message record
    const uniqueId = `reply-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const replySubject = subject.toLowerCase().startsWith('re:') ? subject : `Re: ${subject}`;

    const outbound = await prisma.outboundMessage.create({
      data: {
        leadId: lead.id,
        accountId: account.id,
        to: lead.email,
        subject: replySubject,
        body,
        status: 'pending',
        tenantId: user.tenantId!,
        idempotencyKey: uniqueId,
      },
    });

    // 4. Enqueue email send workflow
    await enqueueEmailSendWorkflow(
      {
        outboundMessageId: outbound.id,
        accountId: account.id,
        to: lead.email,
        subject: replySubject,
        body,
        leadId: lead.id,
      },
      user.tenantId!
    );

    return NextResponse.json({
      success: true,
      message: 'Reply enqueued successfully',
      outboundMessage: {
        id: outbound.id,
        type: 'outbound',
        fromEmail: account.email,
        fromName: 'Me',
        to: outbound.to,
        subject: outbound.subject,
        body: outbound.body,
        date: outbound.createdAt,
      },
    });
  } catch (error) {
    console.error('[inbox-reply] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
