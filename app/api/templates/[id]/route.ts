import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { parseBody } from '@/lib/validation/core';
import { updateTemplateSchema } from '@/lib/validation/schemas';
import { invalidateList } from '@/lib/cache';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;

  const { id } = await params;
  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(template);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { id } = await params;
  const parsed = await parseBody(req, updateTemplateSchema, 'Invalid template update');
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  const existing = await prisma.template.findUnique({ where: { id }, select: { createdById: true } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isManager = user.role === 'director' || user.role === 'floor_manager';
  if (!isManager && existing.createdById !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const template = await prisma.template.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.channel !== undefined && { channel: body.channel }),
      ...(body.subject !== undefined && { subject: body.subject }),
      ...(body.body !== undefined && { body: body.body }),
      ...(body.category !== undefined && { category: body.category }),
    },
  });

  await invalidateList(user.tenantId, 'templates');
  return NextResponse.json(template);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { id } = await params;

  const existing = await prisma.template.findUnique({ where: { id }, select: { createdById: true } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isManager = user.role === 'director' || user.role === 'floor_manager';
  if (!isManager && existing.createdById !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.template.delete({ where: { id } });
  await invalidateList(user.tenantId, 'templates');
  return NextResponse.json({ success: true });
}
