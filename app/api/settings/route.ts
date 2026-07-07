import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { handleApiError } from '@/lib/api/errors';

export async function GET() {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const profile = await prisma.user.findFirst({ where: { id: user.id } });
  if (!profile) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({
    id: profile.id,
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    timezone: profile.timezone ?? 'Asia/Ho_Chi_Minh',
    avatarUrl: profile.avatarUrl ?? null,
    role: profile.role,
  });
}

export async function PUT(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  let firstName: string | undefined;
  let lastName: string | undefined;
  let timezone: string | undefined;
  let avatarUrl: string | undefined;
  try {
    const body = await req.json();
    firstName = typeof body.firstName === 'string' ? body.firstName.trim() : undefined;
    lastName = typeof body.lastName === 'string' ? body.lastName.trim() : undefined;
    timezone = typeof body.timezone === 'string' ? body.timezone.trim() : undefined;
    avatarUrl = typeof body.avatarUrl === 'string' ? body.avatarUrl.trim() : undefined;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (firstName !== undefined && (firstName.length < 1 || firstName.length > 120)) {
    return NextResponse.json({ error: 'firstName must be 1-120 characters' }, { status: 400 });
  }
  if (lastName !== undefined && lastName.length > 120) {
    return NextResponse.json({ error: 'lastName must be 120 characters or fewer' }, { status: 400 });
  }
  if (timezone !== undefined && timezone.length > 60) {
    return NextResponse.json({ error: 'timezone too long' }, { status: 400 });
  }
  if (avatarUrl !== undefined && avatarUrl.length > 1000) {
    return NextResponse.json({ error: 'avatarUrl too long' }, { status: 400 });
  }

  try {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        ...(timezone !== undefined && { timezone }),
        // Empty string clears the avatar (stored as NULL).
        ...(avatarUrl !== undefined && { avatarUrl: avatarUrl || null }),
      },
    });

    return NextResponse.json({
      id: updated.id,
      firstName: updated.firstName,
      lastName: updated.lastName,
      email: updated.email,
      timezone: updated.timezone ?? 'Asia/Ho_Chi_Minh',
      avatarUrl: updated.avatarUrl ?? null,
      role: updated.role,
    });
  } catch (err) {
    return handleApiError('api/settings PUT', err);
  }
}
