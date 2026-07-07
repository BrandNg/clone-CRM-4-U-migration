import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireRole, getVisibleUserIds, type SessionUser } from '@/lib/auth';
import { hash } from 'bcryptjs';
import { parseBody } from '@/lib/validation/core';
import { createUserSchema } from '@/lib/validation/schemas';
import { handleApiError } from '@/lib/api/errors';

export async function GET() {
  // Any authenticated user may read the user list; results are scoped by
  // getVisibleUserIds (SDR → just themselves, pod members for managers, etc.).
  // The list powers assignee names/filters on shared pages (Leads), so gating it
  // to managers only made SDRs throw a 403 on every Leads load.
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;
  const visibleIds = await getVisibleUserIds(user);

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      ...(visibleIds ? { id: { in: visibleIds } } : {}),
    },
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
    orderBy: [{ role: 'asc' }, { lastName: 'asc' }],
  });

  // Per-user-scoped (pod members vary by viewer): never store in a shared/edge
  // cache, and don't reuse across a session switch. `no-store` prevents both the
  // cross-user edge-cache leak and stale-after-switch data.
  return NextResponse.json(users, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(req: NextRequest) {
  const userOrRes = await requireRole('director');
  if (userOrRes instanceof NextResponse) return userOrRes;

  const parsed = await parseBody(req, createUserSchema, 'Invalid user create');
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) {
    return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
  }

  // managerId must reference a real, active user
  if (body.managerId) {
    const manager = await prisma.user.findUnique({ where: { id: body.managerId } });
    if (!manager || !manager.isActive) {
      return NextResponse.json({ error: 'Manager not found' }, { status: 400 });
    }
  }

  const hashedPassword = await hash(body.password, 12);

  try {
    const user = await prisma.user.create({
      data: {
        email: body.email,
        password: hashedPassword,
        firstName: body.firstName,
        lastName: body.lastName,
        role: body.role,
        managerId: body.managerId ?? null,
        timezone: body.timezone ?? 'UTC',
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        managerId: true,
        createdAt: true,
      },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    return handleApiError('api/users POST', err);
  }
}
