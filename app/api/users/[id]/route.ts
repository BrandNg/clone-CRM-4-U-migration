import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, canAccessUser } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { hash } from 'bcryptjs';
import { parseBody } from '@/lib/validation/core';
import { updateUserSchema } from '@/lib/validation/schemas';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const currentUser = userOrRes as SessionUser;

  const { id } = await params;
  if (!(await canAccessUser(currentUser, id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      managerId: true,
      avatarUrl: true,
      timezone: true,
      isActive: true,
      createdAt: true,
    },
  });

  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(user);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const currentUser = userOrRes as SessionUser;

  const { id } = await params;
  const parsed = await parseBody(req, updateUserSchema, 'Invalid user update');
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  const isSelf = currentUser.id === id;
  const isDirector = currentUser.role === 'director';
  const isFloorManager = currentUser.role === 'floor_manager';

  // A Floor Manager may manage team membership for users inside their own floor.
  const fmCanManage = isFloorManager && !isSelf && (await canAccessUser(currentUser, id));

  // Authorize: self, director (any), or floor manager editing an in-floor user.
  if (!isSelf && !isDirector && !fmCanManage) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updateData: any = {};

  // Profile fields: only the user themselves or a director.
  if (isSelf || isDirector) {
    if (body.firstName !== undefined) updateData.firstName = body.firstName;
    if (body.lastName !== undefined) updateData.lastName = body.lastName;
    if (body.timezone !== undefined) updateData.timezone = body.timezone;
    if (body.avatarUrl !== undefined) updateData.avatarUrl = body.avatarUrl;
  }

  // Director-only fields
  if (isDirector) {
    if (body.role !== undefined) updateData.role = body.role;
    if (body.managerId !== undefined) updateData.managerId = body.managerId;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
  }

  // Floor Manager — may reassign team membership (managerId) within their floor.
  // Both the target (checked above) and the new manager must be inside the floor;
  // null (orphaning the user) stays Director-only.
  if (fmCanManage && body.managerId !== undefined && body.managerId !== null) {
    if (!(await canAccessUser(currentUser, body.managerId))) {
      return NextResponse.json({ error: 'Forbidden: manager outside your floor' }, { status: 403 });
    }
    updateData.managerId = body.managerId;
  }

  // Password reset — directors only; regular users must use /api/settings/password
  if (body.newPassword && currentUser.role === 'director') {
    updateData.password = await hash(body.newPassword, 12);
  }

  const user = await prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true, email: true, firstName: true, lastName: true,
      role: true, managerId: true, timezone: true, isActive: true,
    },
  });

  return NextResponse.json(user);
}
