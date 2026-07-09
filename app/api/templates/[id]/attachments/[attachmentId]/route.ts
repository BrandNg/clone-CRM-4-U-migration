import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { id: templateId, attachmentId } = await params;

  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    select: { id: true, templateId: true, tenantId: true },
  });

  if (!attachment) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
  }

  if (attachment.templateId !== templateId || attachment.tenantId !== user.tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.attachment.delete({
    where: { id: attachmentId },
  });

  return NextResponse.json({ success: true });
}
