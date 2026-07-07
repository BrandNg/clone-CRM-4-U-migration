import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, canAccessUser } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { parseBody } from '@/lib/validation/core';
import { updateNoteSchema } from '@/lib/validation/schemas';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { id } = await params;
  const parsed = await parseBody(req, updateNoteSchema, 'Invalid note update');
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  const existing = await prisma.note.findUnique({ where: { id }, select: { createdById: true } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!(await canAccessUser(user, existing.createdById))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const note = await prisma.note.update({
    where: { id },
    data: {
      ...(body.content !== undefined && { content: body.content }),
      ...(body.isPinned !== undefined && { isPinned: body.isPinned }),
    },
  });

  return NextResponse.json(note);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { id } = await params;

  const existing = await prisma.note.findUnique({ where: { id }, select: { createdById: true } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!(await canAccessUser(user, existing.createdById))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.note.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
