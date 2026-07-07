import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { parseBody } from '@/lib/validation/core';
import { updateReminderSchema } from '@/lib/validation/schemas';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { id } = await params;

  const existing = await prisma.reminder.findUnique({ where: { id }, select: { userId: true } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (existing.userId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = await parseBody(req, updateReminderSchema, 'Invalid reminder update');
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  const updated = await prisma.reminder.update({
    where: { id },
    data: {
      ...(body.isDismissed !== undefined && { isDismissed: body.isDismissed }),
      ...(body.text !== undefined && { text: body.text }),
      ...(body.dueAt !== undefined && { dueAt: body.dueAt }),
    },
  });

  return NextResponse.json(updated);
}
